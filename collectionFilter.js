import { log } from "./log.js";

export default class collectionFilter {

    static Sort(field, objectsList, asc = null, desc = null) {
        log(FgGreen, "sort by " + field + " asc: " + asc + " desc: " + desc);
        if (asc != null || desc != null) { // has asc or desc prop
            if (asc)
                return objectsList.sort((a, b) => a[field].toLowerCase().localeCompare(b[field].toLowerCase()))
            else if (desc)
                return objectsList.sort((a, b) => b[field].toLowerCase().localeCompare(a[field].toLowerCase()))
        } else
            return objectsList.sort((a, b) => a[field].toLowerCase().localeCompare(b[field].toLowerCase()))

    }
    static Propriete(query, objectsList) {
        console.log("in propriete...")
        console.log(query)
        let field = Object.keys(query);
        let value = query[field];
        
        if (!value.includes('*')){ // just the value
            if(Array.isArray(objectsList))
                return objectsList.find(o => o[field] === value);
            else{ // only one obj or none
                if(objectsList.length > 0)
                    objectsList[field] == value ? objectsList : null
            }
        }
        
        else if (value.endsWith('*') && value.startsWith('*')) {
            let mylist = [];
            value = value.replaceAll('*', '');
            console.log("Titres contenant: " + value)
            if (value.length > 0) {
                objectsList.forEach(element => {
                    if (element[field].toLowerCase().includes(value.toLowerCase()))
                        mylist.push(element);
                });
                return mylist;
            }
        }
        else if (value.endsWith('*')) { // abc* -> Title commencant par...
            let mylist = [];
            value = value.replace('*', '');
            console.log("Titres finissant par " + value)
            objectsList.forEach(element => {
                if (element[field].toLowerCase().startsWith(value.toLowerCase()))
                    mylist.push(element);
            });
            return mylist;
        }
        else if (value.startsWith('*')) {// *abc -> Title finisant par...
            let mylist = [];
            value = value.replace('*', '');
            console.log("Titres commençant par " + value)
            objectsList.forEach(element => {
                if (element[field].toLowerCase().endsWith(value.toLowerCase()))
                    mylist.push(element);
            });
            return mylist;
        }

    }
    static Category(category, objectsList) { // abc -> retoune champs avec cette categorie
        console.log("Category function...")
        console.log("categorie recherchée: " + category)
        let mylist = [];
        objectsList.forEach(element => {
            if (element.Category.toLowerCase() === category.toLowerCase())
                mylist.push(element);
        });
        return mylist;
    }
    static Fields(objectsList, fields) {
        console.log("Fields function...")
        let mylist = []
        console.log(fields)
        console.log(objectsList)
        objectsList.forEach(element => {
            mylist.push(Object.fromEntries(fields.map(k => [k, element[k]])))
        });
        return mylist;
    }
    static Field(field, objectsList) {
        console.log("Field...");
        console.log(field)
        let mylist = []
        objectsList.forEach(element => {
            if (!mylist.includes(element[field])) {
                mylist.push(element[field]);
            }
        });
        return mylist;
    }
    static LimitOffset(limit, offset, objectList) {
        let mylist = []
        let index = null;
        console.log("foreach...")
        objectList.forEach(element => {
            index = objectList.indexOf(element);
            if (index > limit && index <= offset)
                mylist.push(element);
        });
        return mylist;
    }
}
