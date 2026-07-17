type IsIdUsedFunc = (id: number) => boolean

class IdManager {
    private nextId: number
    private freeIds: number[]
    private isIdUsed: IsIdUsedFunc

    constructor(isIdUsed: IsIdUsedFunc, start = 1) {
        this.nextId = start
        this.freeIds = []
        this.isIdUsed = isIdUsed
    }

    acquire(): number {
        // 1. ưu tiên freeIds
        while (this.freeIds.length > 0) {
            const id = this.freeIds.shift()!;
            if (!this.isIdUsed(id)) {
                return id;
            }
            // id bẩn → bỏ qua
        }

        // 2. cấp id mới
        while (this.isIdUsed(this.nextId)) {
            this.nextId++;
        }

        return this.nextId++;
    }

    release(id: number) {
        if (id <= 0 || id >= this.nextId) return;
        if (!this.freeIds.includes(id)) {
            this.freeIds.push(id);
            this.freeIds.sort((a, b) => a - b);
        }
    }
}

export default IdManager