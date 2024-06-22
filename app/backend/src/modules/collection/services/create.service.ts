import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { UnzipperService } from 'src/modules/unzipper/services/unzipper.service';
import { CreateCollection } from '../interfaces/create.interface';
import { AssetDetails } from '../class/asset-details.class';
import { InvalidAssetsException } from '../exceptions/invalid-assets.exeption';
import { Collection } from '../entities/collection.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PathDetails } from '../interfaces/path-details.interface';
import { InjectQueue } from '@nestjs/bull';
import { COLLECTION_QUEUE } from '../queue/collection-queue.const';
import { Queue } from 'bull';


@Injectable()
export class CreateCollectionService {

    constructor(
        @InjectRepository(Collection)
        private readonly collectionsRepository: Repository<Collection>,
        @InjectQueue(COLLECTION_QUEUE) private readonly createCollectionQueue: Queue,
        private readonly unzipperService: UnzipperService,
    ) { }

    async exec({ name, assets }: CreateCollection): Promise<void> {

        await this.UnzipAssets({ path: assets.path });

        const extractedAssetsDirectoryPath: string = `${assets.path.split('.zip')[0]}`;

        this.ensureAssets({ assets_path: extractedAssetsDirectoryPath });

        const { assets_details, structure } = this.processDirectoryTree({
            directory_path: extractedAssetsDirectoryPath,
            collection_name: name
        });

        fs.writeFileSync(`${assets.destination}/assets_list.json`, JSON.stringify(structure));
        fs.writeFileSync(`${assets.destination}/data.json`, JSON.stringify(assets_details));

        await this.collectionsRepository.save({ name });

        this.createCollectionQueue.add('create', {
            collection_name: name,
            assets_path: extractedAssetsDirectoryPath,
        });
    }


    private async UnzipAssets({ path }: { path: string }) {
        await this.unzipperService.unzipFile(path);
        fs.rmSync(path);
    }

    private ensureAssets({ assets_path }: { assets_path: string }) {

        if (!fs.lstatSync(assets_path).isDirectory()) {
            fs.rmSync(path.resolve(assets_path, ".."), { recursive: true })
            throw new InvalidAssetsException();
        }

        this.ensureAssetsFolderName({ assets_path })
    }

    private ensureAssetsFolderName({ assets_path }: { assets_path: string }) {
        if (path.basename(assets_path) !== 'assets') {
            fs.renameSync(assets_path, assets_path.replace(path.basename(assets_path), 'assets'))
        }
    }

    private pathDetails = (_path: string): PathDetails => {

        const isDirectory = fs.lstatSync(_path).isDirectory();

        return (isDirectory) ?
            {
                isDirectory,
                dirname: path.basename(_path)
            } :
            {
                isDirectory: false,
                dirname: path.basename(path.dirname(_path)),
                filename: (path.basename(_path))
            }
    }

    private processDirectoryTree = ({ directory_path, collection_name }: {
        directory_path: string,
        collection_name: string
    }) => {

        const tree = fs.readdirSync(directory_path, { recursive: true, encoding: 'utf8' });
        const structure: Record<string, string[]> = {};
        const assets_details: Record<string, Record<string, AssetDetails>> = {};

        tree.map(child => {

            const { isDirectory, dirname, filename } = this.pathDetails(path.join(directory_path, child));

            if (isDirectory) {

                structure[dirname] = [];


            } else if (filename) {

                structure[dirname].push(filename.split(".svg")[0])

                this.loadAssetsDetails({ filename, dirname, collection_name, assets_details });
            }
        })

        return { structure, assets_details };
    }

    private loadAssetsDetails = ({
        dirname,
        filename,
        assets_details,
        collection_name
    }: {
        dirname: string,
        filename: string,
        collection_name: string,
        assets_details: Record<string, Record<string, AssetDetails>>
    }): void => {

        const asset_path = `http://localhost:9999/files/${collection_name}/assets/${dirname}/${filename}`;

        const details = new AssetDetails({ name: filename.replace('.svg', ''), directory: dirname, path: asset_path });

        if (!assets_details[dirname]) {
            assets_details[dirname] = {}
        }

        assets_details[dirname][filename.replace('.svg', '')] = details;
    }
}