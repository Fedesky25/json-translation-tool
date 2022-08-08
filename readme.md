# JSON translation tool

Client-side static page that acts as a tool to translate JSON files with texts in other languages through a simple editor. There are two version: the recommended one uses the new experimental File System Access API ([caniuse](https://caniuse.com/native-filesystem-api)) while the second simply uses an input file (with webkitfolder).

## Expected file structure

The tool opens a folder project that contains:

- a `manifest.json` file which specifies the languages of the projects
- any number of subfolders containing `<locale-code>.json` files

## Project manifest

The manifest inside a folder project specifies the language of reference and all the "foreign" ones. For each of them, the locale code and name must be provided. The `./<subfolder>/<reference.code>.json` file is taken as reference texts (and won't be changed in the file system access version).

Typescript type definition:

```ts
interface LanguageLocale {
    code: string;
    name: string;
}
interface Manifest {
    reference: LanguageLocale;
    foreign: LanguageLocale[];
}
```

Example:

```json
{
    "reference": {
        "code": "en",
        "name": "English"
    },
    "foreign": [
        {
            "code": "it",
            "name": "Italiano"
        },
        {
            "code": "fr",
            "name": "Français"
        }
    ]
}
```

## Texts JSON files

They are the `<locale-code>.json` files inside the subfolders of the project folder, and their typescript interface description would be the following one.

```ts
interface Texts {
    [key: string]: string|Texts;
} 
```

Example:

```json
{
    "title": "Welcome back!",
    "profile": {
        "see": "See your profile",
        "edit": "Edit your profile",
        "posts": "Your posts"
    },
    "aboutus": {
        "title": "About us",
        "description": "lorem ipsum ...",
        "geo": {
            "nation": "United Kingdom",
            "city": "London"
        }
    }
}
```

The only mandatory file inside each subfolder is the one related to the reference language (`<manifest.reference.code>.json`).
