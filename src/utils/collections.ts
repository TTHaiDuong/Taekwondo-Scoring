export class OrderedUniqueList<T> {
    private items: T[] = []
    private indices = new Map<T, number>()

    add(item: T) {
        if (this.indices.has(item)) return

        this.indices.set(item, this.items.length)
        this.items.push(item)
    }

    get size() {
        return this.items.length
    }

    has(item: T) {
        return this.indices.has(item)
    }

    indexOf(item: T) {
        return this.indices.get(item) ?? -1
    }

    remove(item: T) {
        const idx = this.indices.get(item)
        if (idx === undefined) return

        this.items.splice(idx, 1)
        this.indices.delete(item)

        for (let i = idx; i < this.items.length; i++) {
            this.indices.set(this.items[i], i)
        }
    }

    values() {
        return this.items
    }
}
