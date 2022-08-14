/**@typedef {{code: string, name: string}} LanguageInfo */
/**@typedef {{reference: LanguageInfo, foreign: LanguageInfo[]}} Manifest */

document.onreadystatechange = function() {
    if(document.readyState !== "complete") return;
    document.getElementById("project").addEventListener("submit", parse_project);
}

/**
 * @this {HTMLFormElement}
 * @param {Event} e
 */
async function parse_project(e) {
    e.preventDefault();
    const files = this.querySelector("input").files;
    if(!files || files.length === 0) return alert("No project folder selected");
    const base = files[0].webkitRelativePath.split("/")[0];
    // const paths = files.map(f => f.webkitRelativePath.slice(folder_name_len));
    // console.log(paths);

    const manifest_file = get_manifest(base, files);
    if(!manifest_file) return alert("manifest.json is missing");
    const manifest = await parse_manifest(manifest_file);
    if(!manifest) return alert("manifest.json has wrong format");

    const folders = get_folders(base, manifest.reference.code, files);
    if(folders.length === 0) return alert("No subfolders");
    this.classList.add("hidden");

    handle_selection(manifest, base, folders, files);
}

/**
 * @param {File} file 
 * @returns {Promise<Manifest | null>}
 */
async function parse_manifest(file) {
    try {
        const manifest = JSON.parse(await file.text());
        return is_obj(manifest) && is_lang_info(manifest.reference) && Array.isArray(manifest.foreign) && manifest.foreign.every(is_lang_info) ? manifest : null;
    } catch {
        return null;
    }
}

function is_lang_info(o) {
    return typeof o === "object" && typeof o.code === "string" && typeof o.name === "string";
}

function is_obj(o) { return typeof o === "object"; }
function is_str(s) { return typeof s === "string"; }

/**
 * Retrieves the manifest file from file list
 * @param {string} base 
 * @param {FileList} files 
 */
function get_manifest(base, files) {
    const manifest = base + "/manifest.json";
    for(var file of files) {
        if(file.webkitRelativePath === manifest && file.type === "application/json") {
            return file;
        }
    }
    return null;
}

/**
 * 
 * @param {string} base 
 * @param {string} locale
 * @param {FileList} files 
 */
function get_folders(base, locale, files) {
    const re = new RegExp(`${base}/([\\s\\S]+)/${locale}.json`);
    const folders = [];
    for(var file of files) {
        if(file.type !== "application/json") continue;
        const res = re.exec(file.webkitRelativePath);
        if(!res) continue;
        folders.push(res[1]);
    }
    return folders;
}

/**
 * Creates a select option
 * @param {string} value 
 * @param {string} text 
 * @returns 
 */
function option(value, text) {
    const el = document.createElement("option");
    el.setAttribute("value", value);
    el.textContent = text;
    return el;
}

/**
 * @param {LanguageInfo} info
 */
function lang_checkbox(info) {
    const id = createID();
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = info.code;
    input.id = id;
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = info.name;
    const div = document.createElement("div");
    div.append(input, " ", label);
    return div;
}

function createID() { return Math.random().toString(36).slice(2); }

let texts = {};

/**
 * 
 * @param {Manifest} manifest 
 * @param {string} base
 * @param {string[]} folders 
 * @param {FileList} files 
 */
 function handle_selection(manifest, base, folders, files) {
    /**@type {HTMLFormElement} */
    const selection = document.getElementById("selection");
    /**@type {HTMLSelectElement} */
    const folder_sel = document.getElementById("folder");
    const language_sel = document.getElementById("languages");

    for(var folder of folders) {
        folder_sel.appendChild(option(folder, folder));
    }
    for(var i=0; i<manifest.foreign.length; i++) {
        language_sel.appendChild(lang_checkbox(manifest.foreign[i]));
    }

    selection.classList.remove("hidden");
    selection.addEventListener("submit", sel);

    /**
     * 
     * @param {Event} e 
     */
    function sel(e) {
        e.preventDefault();
        const folder = folder_sel.value;
        const data = new FormData(selection);
        const langs = manifest.foreign.filter(v => !!data.get(v.code));
        if(langs.length === 0) return alert("No language(s) selected");
        prepare(folder, langs);
    }

    /**
     * 
     * @param {string} folder 
     * @param {LanguageInfo[]} langs 
     * @returns 
     */
    async function prepare(folder, langs) {
        const re = new RegExp(`${base}/${folder}/([\\s\\S]+).json`);
        let reference;
        const foreign_file_map = {};
        for(var file of files) {
            const res = re.exec(file.webkitRelativePath);
            if(!res) continue;
            const locale = res[1];
            if(locale === manifest.reference.code) {
                reference = file;
                continue;
            }
            if(langs.find(v => locale === v.code)) {
                foreign_file_map[locale] = file;
                continue;
            }
        }

        try {
            reference = JSON.parse(await reference.text());
        } catch {
            return alert(`Reference file ${folder}/${manifest.reference.code}.json has invalid format`);
        }

        const foreign_objs = await Promise.all(langs.map(l => JSON_parse_file(foreign_file_map[l])));
        reflect_objs(reference, foreign_objs);
        
        texts = {};
        const len = langs.length;
        /**@type {ForeignLanguageData[]} */
        const foreign = new Array(len);
        for(var i=0; i<len; i++) {
            foreign[i] = {
                code: langs[i].code,
                name: langs[i].name,
                data: foreign_objs[i]
            }
            texts[langs[i].code] = foreign_objs[i];
        }

        selection.classList.add("hidden");
        setup_editor(reference, foreign);
    }
}

/**
 * 
 * @param {File} file 
 * @returns 
 */
async function JSON_parse_file(file) {
    if(!file) return {};
    try {
        return JSON.parse(await file.text());
    } catch {
        alert(file.webkitRelativePath + " has invalid format");
        return {};
    }
}

/**
 * 
 * @param {object} source 
 * @param {object[]} destinations 
 */
function reflect_objs(source, destinations) {
    for(var key in source) {
        if(typeof source[key] === "object") {
            for(var dest of destinations) {
                if(typeof dest[key] !== "object") dest[key] = {};
            }
            reflect_objs(source[key], destinations.map(d => d[key]));
        } else {
            for(var dest of destinations) {
                if(!dest[key]) dest[key] = '';
            }
        }
    }
}

/**@typedef {{code: string, name: string, data: object}} ForeignLanguageData */

/**
 * 
 * @param {object} reference 
 * @param {ForeignLanguageData[]} foreigns 
 */
function setup_editor(reference, foreigns) {

    const grid = document.getElementById("grid");
    grid.style.setProperty("--cols", foreigns.length);
    grid.appendChild(head_el("-"));
    for(var f of foreigns) grid.appendChild(head_el(f.name));
    populate(grid, reference, foreigns, 0, '');

    /**@type {HTMLButtonElement} */
    const confirm = document.getElementById("confirm");
    confirm.disabled = false;
    confirm.addEventListener("click", go_to_dowloads);
}

/**
 * 
 * @param {HTMLElement} grid 
 * @param {object} ref 
 * @param {{code: string, data: object}[]} foreign 
 * @param {number} nesting 
 * @param {string} base 
 */
function populate(grid, ref, foreign, nesting, base) {
    for(var key in ref) {
        if(typeof ref[key] === "object") {
            grid.appendChild(nested_text(key, nesting, "subsec"));
            populate(
                grid, 
                ref[key], 
                foreign.map(f => ({code: f.code, data: f.data[key]})), 
                nesting+1,
                key+'.'
            );
        } else {
            grid.appendChild(nested_text(ref[key], nesting, "ref"));
            for(var f of foreign) {
                grid.appendChild(input_el(f.code, base+key, f.data[key]))
            }
        }
    }
}

/**
 * 
 * @param {string} text 
 * @returns 
 */
function head_el(text) {
    const div = document.createElement("div");
    div.textContent = text;
    div.classList.add("head");
    return div;
}

/**
 * 
 * @param {string} text 
 * @param {number} nesting 
 * @param {string} className 
 * @returns 
 */
 function nested_text(text, nesting, className) {
    const div = document.createElement("div");
    div.className = className;
    div.textContent = text;
    div.style.setProperty("--nesting", nesting);
    return div;
}

/**@typedef {HTMLInputElement|HTMLTextAreaElement} Inputy */

/**
 * 
 * @param {string} lang 
 * @param {string} field 
 * @param {string} value 
 * @returns {Inputy}
 */
function input_el(lang, field, value) {
    /**@type {Inputy}*/let input;
    if(value.length > 30) {
        input = document.createElement("textarea");
        input.setAttribute("rows", Math.ceil(value.length/30));
    } else {
        input = document.createElement("input");
        input.type = "text";
    }
    input.value = value;
    input.setAttribute("data-lang", lang);
    input.setAttribute("data-field", field);
    input.addEventListener("input", is_missing);
    input.addEventListener("change", on_change);
    const div = document.createElement("div");
    div.classList.add("field");
    div.classList.toggle("missing", !value);
    div.appendChild(input);
    return div;
}

/**@this {Inputy} */
function is_missing() {
    this.parentElement.classList.toggle("missing", !this.value);
}

/**@this {Inputy} */
function on_change() {
    const path = this.getAttribute("data-field").split('.');
    let obj = texts[this.getAttribute("data-lang")];
    const len = path.length;
    for(var i=0; i<len-1; i++) obj = obj[path[i]];
    obj[path[len-1]] = this.value;
}

/**@this {HTMLButtonElement} */
function go_to_dowloads() {
    this.disabled = true;
    document.getElementById("grid").textContent = '';
    document.getElementById("results").classList.remove("hidden");
    const d = document.getElementById("downloads");
    d.textContent = '';
    for(var l in texts) d.appendChild(create_download_link(l));
}

function create_download_link(locale) {
    const filename = `${locale}.json`;
    const a = document.createElement('a');
    a.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(texts[locale], null, 4)));
    a.setAttribute('download', filename);
    a.textContent = filename;
    return a;
}

document.getElementById("back").addEventListener("click", back_to_start);
function back_to_start() {
    document.getElementById("confirm").disabled = true;
    document.getElementById("results").classList.add("hidden");
    document.getElementById("selection").classList.remove("hidden");
}