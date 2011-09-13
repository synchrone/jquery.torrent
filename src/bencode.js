function bencode(object)
{
    switch(object.constructor)
    {
        case Boolean:
            return 'i' + parseInt(object ? 1 : 0) + 'e';
        break;

        case Number:
            return 'i' + parseInt(object) + 'e';
        break;

        case Date:
            return 'i' + Math.floor(object.valueOf() / 1000) + 'e';
        break;

        case Array:
            var result = new BlobBuilder();
            result.append('l');
            for (var i = 0; i < object.length; i++) {
                result.append(bencode(object[i]));
            }
            result.append('e');
            return result.getBlob();
        break;

        case Object:
            var result = new BlobBuilder();
            result.append('d');

            for (var p in object)
            {
                if ( ! object.hasOwnProperty(p) ) {
                    continue;
                }
                result.append(bencode(String(p))); //key
                result.append(bencode(object[p])); //value
            }
            result.append('e');
            return result.getBlob();
        break;

        case Blob:
            var blob = new BlobBuilder();
                blob.append(object.size.toString());
                blob.append(':');
                blob.append(object);
                return blob.getBlob();
        break;

        case String:
        default:
            var str = object.toString();
            return str.length + ':' + str;
        break;

    }
}
