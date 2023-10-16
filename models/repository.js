import fs from "fs";
import { v1 as uuidv1 } from "uuid";
import * as utilities from "../utilities.js";
import { log } from "../log.js";
import RepositoryCachesManager from "./repositoryCachesManager.js";
import queryString from "query-string";
import collectionFilter from "../collectionFilter.js";
import { count } from "console";

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
        this.error = {error : ''}

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
        if (requestPayload !== null) {
            let [validQuery, paramError, payload, sortParams] = this.validQuery(requestPayload);
            let hasBeenSearched = false
            if (validQuery) {
                if (payload.length > 0) {
                    payload.forEach(element => {
                        for (const [paramProprety, value] of Object.entries(element)) {
                            log(FgYellow, "Param " + paramProprety);
                            console.log(paramProprety)
                            console.log(value)
                            let isValid = this.CheckParamFilter(element)
                            if (!isValid) {
                                bindedDatas = null;
                                paramError.error = `Le format de la requête '${paramProprety}=${value}' est invalide.`;
                                break;
                            }
                            bindedDatas = collectionFilter.Propriete(element, hasBeenSearched ? bindedDatas : objectsList);
                            hasBeenSearched = true
                        };
                    });
                    if (paramError.error != '')
                        return paramError;
                    if (bindedDatas == null)
                        return { error: `No ${this.model.getClassName()} found` };
                }
                if (sortParams.length > 0) {
                    log(FgYellow, "Sorting...");
                    console.log(sortParams[0])
                    sortParams.forEach(param => {
                        if (Object.keys(param) == 'sort') {
                            log(FgYellow, "Sort...");
                            let [estvalide, field, asc, desc, paramError] = this.CheckSortFilter(param['sort']);
                            if (estvalide) {
                                bindedDatas = collectionFilter.Sort(field, hasBeenSearched ? bindedDatas : objectsList, asc, desc);
                                hasBeenSearched = true
                            }
                            else {
                                log(FgRed, paramError.error)
                                return paramError
                            }
                        }
                        if (Object.keys(param) == 'field') {
                            log(FgYellow, "Param field");
                            let [estvalide, fields, paramError] = this.CheckFields(param)
                            console.log("est valide: " + estvalide)
                            console.log(fields)

                            if (estvalide) {
                                bindedDatas = collectionFilter.Field(fields, hasBeenSearched ? bindedDatas : objectsList)
                                hasBeenSearched = true
                                //return newObjectsList; // c'est juste une liste, pas une liste d'objets
                            } else
                                bindedDatas = null;
                                return bindedDatas = paramError;
                        }
                        if (Object.keys(param) == 'fields') {
                            log(FgYellow, "Param fieldsss");
                            let [estvalide, fields, paramError] = this.CheckFields(param)
                            if (estvalide) {
                                bindedDatas = collectionFilter.Fields(hasBeenSearched ? bindedDatas : objectsList, fields);
                                hasBeenSearched = true
                            }
                            else
                                bindedDatas = paramError
                        }
                        if (Object.keys(param) == 'limit') {
                            log(FgYellow, "Param limit offset");
                            let [estvalid, paramError] = this.CheckLimitOffset(requestPayload['limit'], requestPayload['offset']);
                            if (estvalid) {
                                bindedDatas = collectionFilter.LimitOffset(requestPayload['limit'], requestPayload['offset'], hasBeenSearched ? bindedDatas : objectsList)
                            }
                            else return paramError;
                        }
                    });
                }
            } else
                return paramError;
        }
        else {
            log(FgYellow, "No request payload -> GetAll ");
            bindedDatas = objectsList;
        }
        return bindedDatas.length > 0 ? bindedDatas : {error: "Ressources not found"};
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
        console.log(payload)
        let paramError = { error: '' }
        let isValid = true
        let myPayload = []
        let sortParams = []
        let validSortParams = ['sort', 'limit', 'offset', 'field', 'fields']
        for (let [param, value] of Object.entries(payload)) {
            if (value == undefined || value == '') {
                paramError.error = `Value of '${param}' parameter missing.`
                isValid = false
            }
            if (!validSortParams.includes(param)) {
                if (!this.model.isMember(param)) {

                    paramError.error = `Parameter '${param}' invalid.`
                    isValid = false
                }
                else myPayload.push({ [param]: value })
            } else sortParams.push({ [param]: value })
        }
        console.log(sortParams)
        if ('limit' in payload) {
            if (!('offset' in payload)) {
                paramError.error = "Offset parameter missing"
                isValid = false
            }
        }
        if ('offset' in payload) {
            if (!('limit' in payload)) {
                paramError.error = "Limit parameter missing"
                isValid = false
            }
        }
        if('field' in payload && 'fields' in payload){
            isValid = false
            paramError.error = 'Query error: fields and field cannot be in the same query';
        }
        return [isValid, paramError, myPayload, sortParams];
    }

    CheckSortFilter(sortQuery) {
        let filter = null
        let asc = null
        let desc = null;
        let isvalid = true;
        let paramError = { error: "" };
        console.log(sortQuery)
        console.log("check sort filter...")
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

    CheckParamFilter(paramQuery) { // check if model has the param proprety 
        let isvalid = true;
        let field = Object.keys(paramQuery);
        let value = paramQuery[field];
        console.log("Param query:")
        console.log(paramQuery)
        if (!this.model.isMember(field)) {
            isvalid = false;
            paramError.error = `Le modèle de données "${this.objectsName}" ne contient pas la propriété '${field}'.`;
        }
        if (value.includes("*")) {
            let indexes = this.indexesOf(value, '*')
            let count = indexes.length
            console.log("HAAS **")
            console.log(value + count)
            if (count > 2) {
                isvalid = false;
            }
            else if (count == 1) {
                if ((indexes != 0 && indexes != value.length - 1) || value == "*")  // au debut ou a la fin
                    isvalid = false;
            }
            else if (count == 2) {
                if (indexes[0] != 0 || indexes[1] != value.length - 1 || value == "**")  // au debut et a la fin
                    isvalid = false;
            }
        }
        return isvalid;
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

    CheckFields(param) {
        console.log("check fields");
        console.log(param)
        let myFields = [];
        let isvalid = true
        let paramError = { error: "" }
        if (Object.keys(param) == 'field') { // voir seulement ce field
            if (!this.model.isMember(param['field'])) {
                isvalid = false;
                if (param['field'].length < 1)
                    paramError.error = `Field parameter invalid.`;
                else
                    paramError.error = `${this.objectsName} does not contain the '${param['field']}' property.`;
            }
            return [isvalid, param['field'], paramError];
        } else { // fields voir ces propriétés...
            let paramError = { error: '' };
            let isvalid = true;
            let fields = param['fields'].split(',');
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
        }
        return [isvalid, myFields, paramError];
    }
    /*CheckField(fieldString) {
        console.log("check field");
        console.log(fieldString)
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
    }*/
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
