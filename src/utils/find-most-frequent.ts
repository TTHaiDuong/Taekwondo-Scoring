export function findMostFrequent<T>(arr: any[] | T[]): [any | T, number] {
    const countMap = new Map();

    for (const num of arr) {
        countMap.set(num, (countMap.get(num) || 0) + 1);
    }

    if (countMap.size === 0) return [null, 0];
    return [...countMap.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
}