import { CSSProperties } from "react"

export type StyleProps = {
    className?: string,
    style?: CSSProperties
}

export type ComponentEvents<T> = {
    onClick?(e: React.MouseEvent<T> | undefined): void
    onMouseUp?(e: React.MouseEvent<T> | undefined): void
    onMouseDown?(e: React.MouseEvent<T> | undefined): void
    onMouseEnter?(e: React.MouseEvent<T> | undefined): void
    onMouseLeave?(e: React.MouseEvent<T> | undefined): void
}

export type Setter<T> = (previous: T) => T

export type SetterGetter<VariableName extends string, T> = {
    [K in VariableName as `get${Capitalize<K>}`]: () => T
} & {
    [K in VariableName as `set${Capitalize<K>}`]: (value: T | Setter<T>) => void
}

export type Vector2 = {
    x: number,
    y: number
}