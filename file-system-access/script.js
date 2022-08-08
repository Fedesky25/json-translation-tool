/**@type {HTMLFormElement} */
const selection_form = document.getElementById("selection");
/**@type {HTMLButtonElement} */
const confirm_btn = document.getElementById("confirm");

if(typeof (window.showDirectoryPicker) === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "center";
    btn.textContent = "Select project folder";
    btn.addEventListener("click", select_project_dir);
    document.body.appendChild(btn);
} else {
    document.body.appendChild(text_el("div", "File System Access API is not supported", "error center"));
}

/**@this {HTMLElement} */
async function select_project_dir() {
    try {
        const handle = await window.showDirectoryPicker({
            id: "translation-tool",
            mode: "readwrite",
        });
        start(handle);
    } catch {
        document.body.appendChild(text_el("div", "No folder selected", "error center"))
    }
    this.remove();
}

/**@typedef {{code: string, name: string}} LanguageInfo */
/**@typedef {{reference: LanguageInfo, foreign: LanguageInfo[]}} Manifest */

/**
 * 
 * @param {FileSystemDirectoryHandle} handle 
 */
async function start(handle) {
    /**@type {Manifest} */
    let manifest;

    try {
        const manifest_handle = await handle.getFileHandle("manifest.json");
        const manifest_file = await manifest_handle.getFile();
        manifest = JSON.parse(await manifest_file.text());
    } catch(err) {
        console.log(err);
        return alert("could not read manifest.json");
    }

    if(!(
        typeof manifest === "object" && 
        is_lang_info(manifest.reference) && 
        Array.isArray(manifest.foreign) &&
        manifest.foreign.every(is_lang_info)
    )) return alert("Invalid format of manifest.json");

    // create language selection
    const lang_sel = document.getElementById("languages");
    manifest.foreign.forEach(f => lang_sel.appendChild(lang_checkbox("lang-"+f.code, f.name)));

    // create folder selection
    const folder_sel = document.getElementById("folder");
    let no_folders = true;
    /**@type {Object.<string, FileSystemDirectoryHandle>} */ const folders = {};
    /**@type {string} */ let name;
    /**@type {FileSystemHandle} */ let sub_handle;
    for await([name, sub_handle] of handle) {
        if(sub_handle.kind === "directory") {
            no_folders = false;
            folders[name] = sub_handle;
            folder_sel.appendChild(option(name));
        }
    }
    if(no_folders) return alert("There are no folders");

    // show selection form
    selection_form.classList.remove("hidden");
    selection_form.addEventListener("submit", submit_editor_selection);

    /**
     * @this {HTMLFormElement}
     * @param {Event} e 
     */
    function submit_editor_selection(e) {
        e.preventDefault();
        const data = new FormData(this);
        const folder = folders[data.get("folder")];
        const langs = manifest.foreign.filter(v => !!data.get("lang-"+v.code));
        if(langs.length === 0) return alert("No language seected");
        setup_editor(folder, manifest.reference, langs);
    }
}

function is_lang_info(o) {
    return typeof o === "object" && typeof o.code === "string" && typeof o.name === "string";
}

/**
 * @template {keyof HTMLElementTagNameMap} T
 * @param {T} tag 
 * @param {string} text 
 * @param {string} classname 
 * @returns {HTMLElementTagNameMap[T]}
 */
function text_el(tag, text, classname) {
    const el = document.createElement(tag);
    if(classname) el.className = classname;
    el.textContent = text;
    return el;
}

/**
 * Creates a select option
 * @param {string} value
 * @returns 
 */
 function option(value) {
    const el = document.createElement("option");
    el.setAttribute("value", value);
    el.textContent = value;
    return el;
}

/**
 * @param {string} name
 * @param {string} text 
 */
 function lang_checkbox(name,text) {
    const id = createID();
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.id = id;
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = text;
    const div = document.createElement("div");
    div.append(input, " ", label);
    return div;
}

function createID() { return Math.random().toString(36).slice(2); }

/**
 * 
 * @param {FileSystemDirectoryHandle} dir_handle 
 * @param {LanguageInfo} ref 
 * @param {LanguageInfo[]} sel_foreign 
 */
async function setup_editor(dir_handle, ref, sel_foreign) {
    /**@type {object}*/ let ref_obj;
    /**@type {object[]}*/ let lang_obj;
    try {
        const ref_handle = await dir_handle.getFileHandle(ref.code + ".json");
        const ref_file = await ref_handle.getFile();
        ref_obj = JSON.parse(await ref_file.text()); 
    } catch(err) {
        console.dir(err);
        return alert("Reference text file does not exist or has wrong format");
    }
    try {
        lang_obj = await Promise.all(
            sel_foreign.map(async l => {
                try {
                    const handle = await dir_handle.getFileHandle(l.code + ".json");
                    const file = await handle.getFile();
                    const text = await file.text();
                    return JSON.parse(text) || {};
                } catch {
                    return {};
                }
            })
        );
    } catch(err) {
        console.dir(err);
        return alert("Could not load foreign files");
    }

    // populate grid
    const grid = document.getElementById("grid");
    grid.style.setProperty("--cols", sel_foreign.length);
    grid.appendChild(head_el(ref.name));
    for(var i=0; i<sel_foreign.length; i++) grid.appendChild(head_el(sel_foreign[i].name));
    populate(grid, ref_obj, lang_obj, 0, '', set_value);

    selection_form.classList.add("hidden");
    confirm_btn.disabled = false;
    confirm_btn.classList.remove("hidden");
    confirm_btn.addEventListener("click", save, { once: true });

    /**@this {HTMLInputElement} */
    function set_value() {
        const index = +this.getAttribute("data-index");
        const path = this.getAttribute("data-field").split('.');
        const len = path.length;
        let o = lang_obj[index];
        for(var i=0; i < len-1; i++) o = o[path[i]];
        const v = this.value;
        o[path[len-1]] = v ? v : undefined;
    }

    function save(e) {
        e.preventDefault();
        const len = sel_foreign.length;
        const promises = new Array(len);
        document.body.classList.add("blur");
        for(var i=0; i<len; i++) promises[i] = save_json(dir_handle, sel_foreign[i].code, lang_obj[i]);
        Promise.all(promises).then(
            () => {
                selection_form.classList.remove("hidden");
                confirm_btn.classList.add("hidden");
                confirm_btn.disabled = true;
                grid.textContent = '';
                document.body.classList.remove("blur");
            },
            err => {
                console.dir(err);
                alert("Could not save on disk");
            }
        );
    }
}

/**
 * 
 * @param {FileSystemFileHandle} dir_handle 
 * @param {string} code 
 * @param {object} obj 
 */
async function save_json(dir_handle, code, obj) {
    const handle = await dir_handle.getFileHandle(code + '.json', { create: true });
    const writer = await handle.createWritable();
    await writer.write(JSON.stringify(obj));
    await writer.close();
}

/**@typedef {(this: HTMLInputElement) => void} InputChange */

/**
 * @param {HTMLElement} grid 
 * @param {object} ref 
 * @param {object[]} foreign 
 * @param {number} nesting 
 * @param {string} base 
 * @param {InputChange} callback
 */
 function populate(grid, ref, foreign, nesting, base, callback) {
    for(var key in ref) {
        if(typeof ref[key] === "object") {
            grid.appendChild(nested_text(key, nesting, "subsec"));
            populate(
                grid, 
                ref[key], 
                foreign.map(f => safe_get_obj(f,key)), 
                nesting+1,
                key+'.',
                callback
            );
        } else {
            grid.appendChild(nested_text(ref[key], nesting, "ref"));
            for(var i=0; i<foreign.length; i++) {
                grid.appendChild(input_el(i,base+key,foreign[i][key]||"", callback));
            }
        }
    }
}

/**
 * @param {object} o 
 * @param {string} key 
 * @returns 
 */
function safe_get_obj(o,key) {
    var v = o[key];
    if(typeof v === "object") return v;
    return (o[key] = {});
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

/**
 * 
 * @param {number} index 
 * @param {string} field 
 * @param {string} value 
 * @param {InputChange} callback
 * @returns 
 */
function input_el(index, field, value, callback) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.setAttribute("data-index", index);
    input.setAttribute("data-field", field);
    input.addEventListener("input", is_missing);
    input.addEventListener("change", callback);
    const div = document.createElement("div");
    div.classList.add("field");
    div.classList.toggle("missing", !value);
    div.appendChild(input);
    return div;
}

/**@this {HTMLInputElement} */
function is_missing() {
    this.parentElement.classList.toggle("missing", !this.value);
}
