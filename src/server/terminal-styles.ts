export default class Style {
    private static codes: Record<string, string> = {
        // reset
        reset: "0",

        // text styles
        bold: "1",
        dim: "2",
        italic: "3",
        underline: "4",
        blink: "5",
        inverse: "7",
        hidden: "8",
        strike: "9",

        // foreground colors
        black: "30",
        red: "31",
        green: "32",
        yellow: "33",
        blue: "34",
        magenta: "35",
        cyan: "36",
        white: "37",

        // bright foreground colors
        brightBlack: "90",
        brightRed: "91",
        brightGreen: "92",
        brightYellow: "93",
        brightBlue: "94",
        brightMagenta: "95",
        brightCyan: "96",
        brightWhite: "97",

        // background colors
        bgBlack: "40",
        bgRed: "41",
        bgGreen: "42",
        bgYellow: "43",
        bgBlue: "44",
        bgMagenta: "45",
        bgCyan: "46",
        bgWhite: "47",

        // bright background
        bgBrightBlack: "100",
        bgBrightRed: "101",
        bgBrightGreen: "102",
        bgBrightYellow: "103",
        bgBrightBlue: "104",
        bgBrightMagenta: "105",
        bgBrightCyan: "106",
        bgBrightWhite: "107",
    };

    /** apply multiple styles */
    static apply(text: string, styles: (keyof typeof Style.codes)[]): string {
        const codes = styles.map(s => this.codes[s]).join(";");
        return `\x1b[${codes}m${text}\x1b[0m`;
    }

    /** 256-color mode (foreground) */
    static color256(text: string, code: number): string {
        return `\x1b[38;5;${code}m${text}\x1b[0m`;
    }

    /** 256-color mode (background) */
    static bgColor256(text: string, code: number): string {
        return `\x1b[48;5;${code}m${text}\x1b[0m`;
    }

    /** True color RGB (foreground) */
    static rgb(text: string, r: number, g: number, b: number): string {
        return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
    }

    /** True color RGB (background) */
    static bgRgb(text: string, r: number, g: number, b: number): string {
        return `\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`;
    }
}

export function printLines(lines: (string | number)[]) {
    console.log(lines.join("\n"));
}