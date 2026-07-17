export function measureFontSize(
    text: string,
    maxWidth: number,
    container: HTMLElement
) {
    const style = getComputedStyle(container)

    const measure = document.createElement("span")

    measure.textContent = text

    Object.assign(measure.style, {
        position: "absolute",
        visibility: "hidden",
        whiteSpace: "nowrap",
        left: "-999999px",
        top: "-999999px",

        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        fontStretch: style.fontStretch,
        fontVariantNumeric: style.fontVariantNumeric,
        fontFeatureSettings: style.fontFeatureSettings,
        letterSpacing: style.letterSpacing,
        wordSpacing: style.wordSpacing,
        textTransform: style.textTransform,
    })

    document.body.appendChild(measure)

    let low = 1
    let high = 1000

    while (low < high) {
        const mid = Math.ceil((low + high) / 2)

        measure.style.fontSize = `${mid}px`

        if (measure.getBoundingClientRect().width <= maxWidth)
            low = mid
        else
            high = mid - 1
    }

    document.body.removeChild(measure)

    return low
}