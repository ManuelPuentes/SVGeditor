
export class PaginatedResponse<C> {
    readonly totalItems: number;
    readonly items: C[];
    readonly nextItem?: number;
}
