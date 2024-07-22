import { ensureCollectionExist } from '$lib/api/collection-exist';
import { error } from '@sveltejs/kit';

export async function load({ params }: any) {
	const collection_name = params.collection;

	try {
		await ensureCollectionExist({ collection_name });
		return { collection_name };
	} catch (_error: any) {
		throw error(400, _error.message);
	}
}
