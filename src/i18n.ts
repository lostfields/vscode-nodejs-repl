import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

interface Resource {
    info: {
        initializing: string,
        cwd: string,
        starting: string,
        disposing: string,
    },
    warn: {
        CRUD: string,
    },
    error: {
        notJavascript: string,
    }
}

let resource: Resource;

export default function i18n(lang: string): Resource {

    if (resource) return resource;

    lang = lang.toLowerCase();
    let defaultLang = 'en-us';
    let langs = [lang, lang.split('-')[0], defaultLang];
    let localePath = path.join(__dirname, '../locale/lang.%s.json');

    for (let language of langs) {
        let langResourcePath = util.format(localePath, language);
        if (fs.existsSync(langResourcePath)) {
            return JSON.parse(fs.readFileSync(langResourcePath, 'utf8'));
        }
    }
    throw new Error('Not found any language resource.');
}