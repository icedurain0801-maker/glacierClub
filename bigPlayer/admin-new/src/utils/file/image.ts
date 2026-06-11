export interface ImageSize {
    width: number;
    height: number;
}

const fallbackSize: ImageSize = {
    width: 0,
    height: 0,
};

export function getImageSize(src: string): Promise<ImageSize> {
    if (!src || typeof Image === 'undefined') {
        return Promise.resolve(fallbackSize);
    }

    return new Promise(resolve => {
        const image = new Image();
        image.onload = () => {
            resolve({
                width: image.naturalWidth || image.width || 0,
                height: image.naturalHeight || image.height || 0,
            });
        };
        image.onerror = () => resolve(fallbackSize);
        image.src = src;
    });
}
