import fs from "fs";
import { v1 as uuidv1 } from "uuid";
import * as utilities from "../utilities.js";
import { log } from "../log.js";
import RepositoryCachesManager from "./repositoryCachesManager.js";
import queryString from "query-string";
import collectionFilter from "../collectionFilter.js";

globalThis.jsonFilesPath = "jsonFiles";
globalThis.repositoryEtags = {};


export default class Repository {
    constructor(ModelClass, cached = true) {
        this.objectsList = null;
        this.model = ModelClass;
        this.objectsName = ModelClass.getClassName() + "s";
        this.objectsFile = `./jsonFiles/${this.objectsName}.json`;
        this.initEtag();
        this.cached = cached;

    }
    initEtag() {
        if (this.objectsName in repositoryEtags)
            this.ETag = repositoryEtags[this.objectsName];
        else this.newETag();
    }
    newETag() {
        this.ETag = uuidv1();
        repositoryEtags[this.objectsName] = this.ETag;
    }
    objects() {
        if (this.objectsList == null) this.read();
        return this.objectsList;
    }
    read() {
        this.objectsList = null;
        if (this.cached) {
            this.objectsList = RepositoryCachesManager.find(this.objectsName);
        }
        if (this.objectsList == null) {
            try {
                let rawdata = fs.readFileSync(this.objectsFile);
                // we assume here that the json data is formatted correctly
                this.objectsList = JSON.parse(rawdata);
                if (this.cached)
                    RepositoryCachesManager.add(this.objectsName, this.objectsList);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // file does not exist, it will be created on demand
                    log(FgYellow, `Warning ${this.objectsName} repository does not exist. It will be created on demand`);
                    this.objectsList = [];
                } else {
                    log(FgRed, `Error while reading ${this.objectsName} repository`);
                    log(FgRed, '--------------------------------------------------');
                    log(FgRed, error);
                }
            }
        }
    }
    write() {
        this.newETag();
        fs.writeFileSync(this.objectsFile, JSON.stringify(this.objectsList));
        if (this.cached) {
            RepositoryCachesManager.add(this.objectsName, this.objectsList);
        }
    }
    nextId() {
        let maxId = 0;
        for (let object of this.objects()) {
            if (object.Id > maxId) {
                maxId = object.Id;
            }
        }
        return maxId + 1;
    }
    checkConflict(instance) {
        let conflict = false;
        if (this.model.key)
            conflict = this.findByField(this.model.key, instance[this.model.key], instance.Id) != null;
        if (conflict) {
            this.model.addError(`Unicity conflict on [${this.model.key}]...`);
            this.model.state.inConflict = true;
        }
        return conflict;
    }
    add(object) {
        delete object.Id;
        object = { "Id": 0, ...object };
        this.model.validate(object);
        if (this.model.state.isValid) {
            this.checkConflict(object);
            if (!this.model.state.inConflict) {
                object.Id = this.nextId();
                this.model.handleAssets(object);
                this.objectsList.push(object);
                this.write();
            }
        }
        return object;
    }
    update(id, objectToModify) {
        delete objectToModify.Id;
        objectToModify = { Id: id, ...objectToModify };
        this.model.validate(objectToModify);
        if (this.model.state.isValid) {
            let index = this.indexOf(objectToModify.Id);
            if (index > -1) {
                this.checkConflict(objectToModify);
                if (!this.model.state.inConflict) {
                    this.model.handleAssets(objectToModify, this.objectsList[index]);
                    this.objectsList[index] = objectToModify;
                    this.write();
                }
            } else {
                this.model.addError(`The ressource [${objectToModify.Id}] does not exist.`);
                this.model.state.notFound = true;
            }
        }
        return objectToModify;
    }
    remove(id) {
        let index = 0;
        for (let object of this.objects()) {
            if (object.Id === id) {
                this.model.removeAssets(object)
                this.objectsList.splice(index, 1);
                this.write();
                return true;
            }
            index++;
        }
        return false;
    }
    getAll(requestPayload) {
        let objectsList = this.objects();
        let bindedDatas = [];
        let newObjectsList = null;
        let validQuery = false;
        if (requestPayload !== null) {
            let [validQuery, paramError] = this.validQuery(requestPayload);
            console.log(validQuery);
            console.log(`request payload:`)
            console.log(requestPayload)
            console.log(requestPayload['offset'])
            if (validQuery) {
                if ('sort' in requestPayload) {
                    log(FgYellow, "Sort...");
                    let [estvalide, field, asc, desc, paramError] = this.CheckSortFilter(requestPayload['sort']);
                    if (estvalide)
                        newObjectsList = collectionFilter.Sort(field, objectsList, asc, desc);
                    else {
                        log(FgRed, paramError.error);
                        return paramError;
                    }
                }
                if ('Name' in requestPayload) {
                    log(FgYellow, "Param name");
                    let [estvalide, paramError] = this.CheckSortNameFilter(requestPayload['Name'])
                    if (estvalide) {
                        newObjectsList = collectionFilter.Name(requestPayload['Name'], newObjectsList == null ? objectsList : newObjectsList);
                    }
                    else
                        return paramError;
                } else console.log("no name")
                if ('Category' in requestPayload) {
                    log(FgYellow, "Param category");
                    let paramError = { error: '' }
                    if (this.model.isMember('Category')) {
                        newObjectsList = collectionFilter.Category(requestPayload['Category'], newObjectsList == null ? objectsList : newObjectsList);
                    } else {
                        return paramError.error = `Le modèle ne contient pas le membre 'Category'`;
                    }
                }
                if ('field' in requestPayload) {
                    log(FgYellow, "Param field");
                    let [estvalide, fields, paramError] = this.CheckField(requestPayload['field'])
                    if (estvalide) {
                        newObjectsList = collectionFilter.Field(fields, newObjectsList == null ? objectsList : newObjectsList);
                        //return newObjectsList; // c'est juste une liste, pas une liste d'objets
                    } else
                        return paramError;
                }
                if ('fields' in requestPayload) {
                    log(FgYellow, "Param fields");
                    let [estvalide, fields, paramError] = this.CheckFields(requestPayload['fields'])
                    if (estvalide)
                        newObjectsList = collectionFilter.Fields(newObjectsList == null ? objectsList : newObjectsList, fields);
                    else
                        return paramError;
                }
                if ('limit' in requestPayload && 'offset' in requestPayload) {
                    log(FgYellow, "Param limit offset");
                    let [estvalid, paramError] = this.CheckLimitOffset(requestPayload['limit'], requestPayload['offset']);
                    if (estvalid)
                        newObjectsList = collectionFilter.LimitOffset(requestPayload['limit'], requestPayload['offset'], newObjectsList == null ? objectsList : newObjectsList)

                    else
                        return paramError;
                }
            } else
                return paramError;
        }
        else {
            log(FgYellow, "No request payload -> GetAll ");
            newObjectsList = objectsList;
        }
        // Check if the new formed list is an array of objects
        if (Array.isArray(newObjectsList) && typeof newObjectsList[0] === "object") {
            //binds each objects to the model
            for (let data of newObjectsList) {
                bindedDatas.push(this.model.bindExtraData(data));
            };
        }
        // else, returns the list
        else {
            return newObjectsList;
            //bindedDatas.push(this.model.bindExtraData(newObjectsList));
        }
        return bindedDatas;
    }
    get(id) {
        for (let object of this.objects()) {
            if (object.Id === id) {
                return this.model.bindExtraData(object);
            }
        }
        return null;
    }
    removeByIndex(indexToDelete) {
        if (indexToDelete.length > 0) {
            utilities.deleteByIndex(this.objects(), indexToDelete);
            this.write();
        }
    }
    findByField(fieldName, value, excludedId = 0) {
        if (fieldName) {
            let index = 0;
            for (let object of this.objects()) {
                try {
                    if (object[fieldName] === value) {
                        if (object.Id != excludedId) return this.objectsList[index];
                    }
                    index++;
                } catch (error) { break; }
            }
        }
        return null;
    }
    indexOf(id) {
        let index = 0;
        for (let object of this.objects()) {
            if (object.Id === id) return index;
            index++;
        }
        return -1;
    }

    validQuery(payload) {
        log(FgYellow, "Validating query...");
        let paramError = { error: '' }
        let isValid = true;
        let validParams = ['sort', 'limit', 'offset', 'field', 'fields', 'Name', 'Category']
        for (let [param, value] of Object.entries(payload)) {
            if (!param in validParams || param == undefined) {
                paramError.error = `Parameter '${param}=${value}' unknown.`
                isValid = false
            }
            if (value == undefined || value == ''){
                paramError.error = `Value of '${param}' parameter missing.`
                isValid = false
            }
        }
        if ('limit' in payload) {
            if (! "offset" in payload) {
                paramError.error = "Offset parameter missing"
                isValid = false
            }
        }
        if ('offset' in payload) {
            if (!'limit' in payload) {
                paramError.error = "Limit parameter missing"
                isValid = false
            }
        }

        return [isValid, paramError];
    }

    CheckSortFilter(sortQuery) {
        let filter = null
        let asc = null
        let desc = null;
        let isvalid = true;
        let paramError = { error: "" };

        if (sortQuery.includes(',')) {
            filter = sortQuery.split(',')[0];
            filter = filter[0].toUpperCase() + filter.slice(1)
            if (filter.toUpperCase() == 'NAME')
                filter = 'Title'
            if (sortQuery.split(',')[1] == 'asc')
                asc = true;
            else if (sortQuery.split(',')[1] == 'desc') {
                desc = true;
            }
            else {
                isvalid = false;
                paramError.error = `Paramètre de tri '${sortQuery.split(',')[1]}' invalide.`;
            }
        }
        else {
            filter = sortQuery[0].toUpperCase() + sortQuery.slice(1)
            if (filter.toUpperCase() == "CATEGORY") desc = true;
            else if (filter.toUpperCase() == "NAME") {
                asc = true
                console.log("filter name")
                filter = 'Title'
            }
        }
        if (!this.model.isMember(filter)) {
            console.log(filter)
            console.log("invalide")
            isvalid = false;
            paramError.error = `Paramètre de tri '${filter}' invalide.`;
        }
        return [isvalid, filter, asc, desc, paramError];
    }

    CheckSortNameFilter(nameQuery) { // check if model has 'Title' proprety 
        let isvalid = true;
        let field = null;
        let paramError = { error: "" }
        console.log("Name querrry:")
        console.log(nameQuery)
        if (this.objectsName == "Bookmarks") {
            field = "Title";
            if (!this.model.isMember(field)) {
                isvalid = false;
                paramError.error = `Le modèle de données "${this.objectsName}" ne contient pas la propriété '${filter}'.`;
            }
        }
        if (nameQuery.includes("*")) {
            let indexes = this.indexesOf(nameQuery, '*')
            let count = indexes.length
            if (count > 2) {
                isvalid = false;
            }
            else if (count == 1) {
                if ((indexes != 0 && indexes != nameQuery.length - 1) || nameQuery == "*")  // au debut ou a la fin
                    isvalid = false;
            }
            else if (count == 2) {
                if (indexes[0] != 0 || indexes[1] != nameQuery.length - 1 || nameQuery == "**")  // au debut et a la fin
                    isvalid = false;
            }
            if (!isvalid)
                paramError.error = `Le format de la requête 'Name=${nameQuery}' est invalide.`;
        }
        return [isvalid, paramError];
    }
    indexesOf(string, char) {
        let count = 0;
        let indexes = [];
        for (let index = 0; index < string.length; index++) {
            if (string[index] == char) {
                indexes[count] = index;
                count = count + 1;
            }
        }
        return indexes;
    }

    CheckFields(fieldsString) {
        console.log("check fields");
        let paramError = { error: '' };
        let isvalid = true;
        let fields = fieldsString.split(',');
        let myFields = [];
        fields.forEach(field => {
            field = field[0].toUpperCase() + field.slice(1);
            myFields.push(field)
            if (!this.model.isMember(field)) {
                isvalid = false;
                if (field.length < 1)
                    paramError.error = `Erreur dans l'écriture des paramètres fields.`;
                else
                    paramError.error = `Le modèle de données ${this.objectsName} ne contient pas la propriété '${field}'.`;
            }
        });
        console.log(myFields);
        return [isvalid, myFields, paramError];
    }
    CheckField(fieldString) {
        console.log("check field");
        let paramError = { error: '' };
        let isvalid = true;
        let field = fieldString[0].toUpperCase() + fieldString.slice(1);
        if (!this.model.isMember(field)) {
            isvalid = false;
            if (field.length < 1)
                paramError.error = `Erreur dans l'écriture des paramètres fields.`;
            else
                paramError.error = `Le modèle de données ${this.objectsName} ne contient pas la propriété '${field}'.`;
        }
        return [isvalid, field, paramError];
    }
    CheckLimitOffset(limit, offset) {

        let isvalid = true
        let paramError = { error: '' }
        console.log(" limit: " + limit + " offset: " + offset);
        if (!this.isPositiveInteger(limit)) {
            isvalid = false;
            paramError.error = `Limit parameter must be an integer greater or equal to 0`;
        }
        else if (!this.isPositiveInteger(offset)) {
            isvalid = false;
            paramError.error = `Offset parameter must be an integer greater or equal to 0`;
        }
        else if (parseInt(offset) < parseInt(limit) || parseInt(offset) == parseInt(limit)) {
            isvalid = false; 2
            paramError.error = "Offset number parameter cannot be equal or lesser than the limit number parameter";
        }
        return [isvalid, paramError]
    }

    isPositiveInteger(value) {
        let regex = new RegExp(/^[0-9]*$/)
        return (regex.test(value));
    }
}
