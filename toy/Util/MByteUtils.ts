
export namespace MByteUtils
{

    export function ByteSizeNumberToString(n:number) : string 
    {
        let buff = new Uint8Array(1);
        buff[0]=n;
        return Uint8ArrayToString(buff);    
    }

    export function Uint8ArrayToString(uint8Buffer : Uint8Array) : string
    {
        let result = "";
        uint8Buffer.forEach((v) => {
            result += String.fromCharCode(v);    
        })
        return result;
    }

    export function StringToUInt8s(str : string) : Uint8Array
    {
        let result = new Uint8Array(str.length);

        for(let i=0; i<str.length; ++i) {
            result[i] =str.charCodeAt(i);
        }
        return result;
    }

}