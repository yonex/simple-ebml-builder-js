import * as memoize from "lodash.memoize";
import { numberToByteArray, stringToByteArray } from "./typedArrayUtils";

export interface EBMLData {
    write(buf: Uint8Array, pos: number): number;
    countSize(): number;
}

export class Value implements EBMLData {
    constructor(private bytes: Uint8Array) {
    }

    public write(buf: Uint8Array, pos: number): number {
        buf.set(this.bytes, pos);
        return pos + this.bytes.length;
    }

    public countSize(): number {
        return this.bytes.length;
    }
}

export class Element implements EBMLData {
    private readonly size: number;
    private readonly sizeMetaData: Uint8Array;

    constructor(private id: Uint8Array, private children: EBMLData[], isSizeUnknown: boolean) {
        const bodySize = this.children.reduce((p, c) => p + c.countSize(), 0);
        this.sizeMetaData = isSizeUnknown ?
            UNKNOWN_SIZE :
            vintEncode(numberToByteArray(bodySize, getEBMLByteLength(bodySize)));
        this.size = this.id.length + this.sizeMetaData.length + bodySize;
    }

    public write(buf: Uint8Array, pos: number): number {
        buf.set(this.id, pos);
        buf.set(this.sizeMetaData, pos + this.id.length);
        return this.children.reduce((p, c) => c.write(buf, p), pos + this.id.length + this.sizeMetaData.length);
    }

    public countSize(): number {
        return this.size;
    }
}

export const bytes = memoize((data: Uint8Array): Value => {
    return new Value(data);
});

export const number = memoize((num: number): Value => {
    return bytes(numberToByteArray(num));
});

export const vintEncodedNumber = memoize((num: number): Value => {
    return bytes(vintEncode(numberToByteArray(num)));
});

export const string = memoize((str: string): Value => {
    return bytes(stringToByteArray(str));
});

export const element = (id: Uint8Array, child: EBMLData | EBMLData[]): EBMLData => {
    return new Element(id, Array.isArray(child) ? child : [child], false);
};

export const unknownSizeElement = (id: Uint8Array, child: EBMLData | EBMLData[]): EBMLData => {
    return new Element(id, Array.isArray(child) ? child : [child], true);
};

export const build = (v: EBMLData): Uint8Array => {
    const b = new Uint8Array(v.countSize());
    v.write(b, 0);
    return b;
};

export const getEBMLByteLength = (num: number): number => {
    if (num < 0x80) {
        return 1;
    } else if (num < 0x4000) {
        return 2;
    } else if (num < 0x200000) {
        return 3;
    } else if (num < 0x10000000) {
        return 4;
    } else if (num < 0x080000000) {
        return 5;
    } else if (num < 0x04000000000) {
        return 6;
    } else if (num < 0x02000000000000) {
        return 7;
    } else if (num < 0x010000000000000) {
        return 8;
    } else {
        throw new Error(`data size must be less than or equal to ${2 ** 56 - 2}`);
    }
};

export const UNKNOWN_SIZE = new Uint8Array([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

export const vintEncode = (byteArray: Uint8Array): Uint8Array => {
    byteArray[0] = getSizeMask(byteArray.length) | byteArray[0];
    return byteArray;
};

export const getSizeMask = (byteLength: number): number => {
    return 0x80 >> (byteLength - 1);
};
