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
    static Name(query, objectsList) {
        console.log("in name...")
        if (!query.includes('*')) // just the name
            return objectsList.find(({ Title }) => Title.toLowerCase() === query.toLowerCase());
        else if (query.endsWith('*') && query.startsWith('*')) {
            let mylist = [];
            query = query.replaceAll('*', '');
            console.log("Titres contenant: " + query)
            if (query.length > 0) {
                objectsList.forEach(element => {
                    if (element.Title.toLowerCase().includes(query.toLowerCase()))
                        mylist.push(element);
                });
                return mylist;
            }
        }
        else if (query.endsWith('*')) { // abc* -> Title commencant par...
            let mylist = [];
            query = query.replace('*', '');
            console.log("Titres finissant par " + query)
            objectsList.forEach(element => {
                if (element.Title.toLowerCase().startsWith(query.toLowerCase()))
                    mylist.push(element);
            });
            return mylist;
        }
        else if (query.startsWith('*')) {// *abc -> Title finisant par...
            let mylist = [];
            query = query.replace('*', '');
            console.log("Titres commençant par " + query)
            objectsList.forEach(element => {
                if (element.Title.toLowerCase().endsWith(query.toLowerCase()))
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
        console.log("Fields function...");     
        let mylist = [];
        objectsList.forEach(element => {
            mylist.push(Object.fromEntries(fields.map(k => [k, element[k]])));
        });
        return mylist;
    }
    static Field(field, objectsList) {
        console.log("Field...");
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
