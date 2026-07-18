import { useEffect, useState } from "react";

export function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const media = window.matchMedia("(pointer:fine) and (hover:hover)");

        const update = () => setIsDesktop(media.matches);

        update();
        media.addEventListener("change", update);

        return () => media.removeEventListener("change", update);
    }, []);

    return isDesktop;
}