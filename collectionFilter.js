import { log } from "./log.js";

export default class collectionFilter {

    static Sort(propriete, objectsList) {
        log(FgGreen, "sort by " + propriete);
        if (propriete.includes(',')) { // has asc or desc prop
            propriete = propriete.split(",")
            if (propriete[0] === 'name') {
                if (propriete[1].toLowerCase() === 'asc')
                    return objectsList.sort((a, b) => a.Title.toLowerCase().localeCompare(b.Title.toLowerCase()))
                else if (propriete[1].toLowerCase() === 'desc')
                    return objectsList.sort((a, b) => b.Title.toLowerCase().localeCompare(a.Title.toLowerCase()))
            } else if (propriete[0] === "category") {
                if (propriete[1].toLowerCase() === 'asc')
                    return objectsList.sort((a, b) => a.Category.toLowerCase().localeCompare(b.Category.toLowerCase()))
                else if (propriete[1].toLowerCase() === 'desc')
                    return objectsList.sort((a, b) => b.Category.toLowerCase().localeCompare(a.Category.toLowerCase()))
            }
        }
        else {
            if (propriete.toLowerCase() === "name") // sort by name asc
                return objectsList.sort((a, b) => a.Title.toLowerCase().localeCompare(b.Title.toLowerCase()))
            if (propriete.toLowerCase() === "category")  // sort by categorie asc
                return objectsList.sort((a, b) => a.Category.toLowerCase().localeCompare(b.Category.toLowerCase()))
        }
    }
    static Name(propriete, objectsList) {
        if (!propriete.includes('*')) // just the name
            return objectsList.find(({ Title }) => Title.toLowerCase() === propriete.toLowerCase());
        else if (propriete.endsWith('*') && propriete.startsWith('*')) {
            console.log("Titres contenant...")
            let mylist = [];
            propriete = propriete.replaceAll('*', '');
            if (propriete.length > 0) {
                objectsList.forEach(element => {
                    if (element.Title.toLowerCase().includes(propriete.toLowerCase()))
                        mylist.push(element);
                });
                return mylist;
            }
        }
        else if (propriete.endsWith('*')) { // abc* -> Title commencant par...
            console.log("Titres commencant par...")
            let mylist = [];
            propriete = propriete.replace('*', '');
            objectsList.forEach(element => {
                if (element.Title.startsWith(propriete))
                    mylist.push(element);
            });
            return mylist;
        }
        else if (propriete.startsWith('*')) {// *abc -> Title finisant par...
            console.log("Titres finissants par...")
            let mylist = [];
            propriete = propriete.replace('*', '');
            objectsList.forEach(element => {
                if (element.Title.endsWith(propriete))
                    mylist.push(element);
            });
            return mylist;
        }

    }
    static Category(propriete, objectsList) { // abc -> retoune champs avec cette categorie
        console.log("has categorie...")
        let mylist = [];
        objectsList.forEach(element => {
            if (element.Category === propriete)
                mylist.push(element);
        });
        return mylist;
    }
    static Fields(propriete, objectsList) {
        console.log("Fields...");
        propriete = propriete.split(",")
        let mylist = [];
        objectsList.forEach(element => {
            mylist.push(Object.fromEntries(propriete.map(k => [k, element[k]])));
        });
        return mylist;
    }
    static Field(propriete, objectsList) {
        console.log("Field...");
        propriete = (propriete[0].toUpperCase() + propriete.slice(1));
        console.log(propriete);
        let mylist = []
        objectsList.forEach(element => {
            if (!mylist.includes(element.Category)) {
                mylist.push(element.Category);
            }
        });
        return mylist;
    }
    static LimitOffset(limit, offset, objectList) {
        let mylist = []
        let index = null;
        if (offset < limit)
            return null;
        objectList.forEach(element => {
            index = objectList.indexOf(element);
            if (index > limit && index <= offset)
                mylist.push(element);
        });
        return mylist;
    }
}
