import fs from "fs";
import { v1 as uuidv1 } from "uuid";
import * as utilities from "../utilities.js";
import { log } from "../log.js";
import RepositoryCachesManager from "./repositoryCachesManager.js";
import queryString from "query-string";
import collectionFilter from "../collectionFilter.js";
import { count } from "console";

global.jsonFilesPath = "jsonFiles";
global.repositoryEtags = {};


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
        if (this.objectsName in global.repositoryEtags){
          console.log("init etag");
          console.log(this.objectsName);
            this.ETag = global.repositoryEtags[this.objectsName];
        }
        else this.newETag();
    }
    newETag() {
      console.log("new etag");
        this.ETag = uuidv1();
        global.repositoryEtags[this.objectsName] = this.ETag;
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
        let error = { error_description: '' }
        let objectsList = this.objects();
        let bindedDatas = [];
        if (requestPayload !== null) {
            let [validQuery, paramError, payload, sortParams] = this.validQuery(requestPayload);
            let hasBeenSearched = false
            console.log(payload)
            if (validQuery) {
                if (Object.keys(payload).length > 0) {
                        for (const param of Object.entries(payload)) {
                            log(FgYellow, "Param " + param);
                            let isValid = this.CheckParamFilter(param)
                            if (!isValid) {
                                bindedDatas = null;
                                error.error_description = `Le format de la requête '${param}' est invalide.`;
                                break;
                            }
                            bindedDatas = collectionFilter.Propriete(param, hasBeenSearched ? bindedDatas : objectsList);
                            hasBeenSearched = true
                        };
                    if (error.error_description != '')
                        return paramError;
                    if (bindedDatas == null)
                        return { error_description: `No ${this.model.getClassName()} found` };

                }// end params proprety
                if (Object.keys(sortParams).length > 0) {
                    log(FgYellow, "Sorting...");
                    console.log(sortParams)
                    //object.hasOwnProperty('key')
                    if (sortParams.hasOwnProperty('sort')) {
                        log(FgYellow, "Sort...");
                        let [estvalide, field, asc, desc, paramError] = this.CheckSortFilter(sortParams['sort']);
                        if (estvalide) {
                            bindedDatas = collectionFilter.Sort(field, hasBeenSearched ? bindedDatas : objectsList, asc, desc);
                            hasBeenSearched = true
                        } else
                            error.error_description = paramError.error
                    }
                    if (sortParams.hasOwnProperty('field') && paramError.error == '') {
                        log(FgYellow, "Param field");
                        let [estvalide, fields, paramError] = this.CheckFields(sortParams["field"])
                        if (estvalide) {
                            bindedDatas = collectionFilter.Field(fields, hasBeenSearched ? bindedDatas : objectsList)
                            hasBeenSearched = true
                            //return newObjectsList; // c'est juste une liste, pas une liste d'objets
                        } else
                            paramError.error = paramError;
                    }
                    if (sortParams.hasOwnProperty('fields') && paramError.error == '') {
                        log(FgYellow, "Param fieldsss");
                        let [estvalide, fields, paramError] = this.CheckFields(sortParams["fields"])
                        if (estvalide) {
                            bindedDatas = collectionFilter.Fields(hasBeenSearched ? bindedDatas : objectsList, fields);
                            hasBeenSearched = true
                        }
                        else
                            error.error_description = paramError.error;
                    }
                    if (sortParams.hasOwnProperty('limit') && error.error_description == '') {
                        log(FgYellow, "Param limit offset");
                        let [estvalid, paramError] = this.CheckLimitOffset(requestPayload['limit'], requestPayload['offset']);
                        if (estvalid) {
                            bindedDatas = collectionFilter.LimitOffset(requestPayload['limit'], requestPayload['offset'], hasBeenSearched ? bindedDatas : objectsList)
                        }
                        else error.error_description = paramError.error;
                    }
                } // end sort param
            }
            else // invalid querry
                return paramError;
        }
        else {
            log(FgYellow, "No request payload -> GetAll ");
            bindedDatas = objectsList;
        }
        if (bindedDatas != null) return bindedDatas
        else return null

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
        let isValid = true
        let myPayload = {}
        let sortParams = {}
        let validSortParams = ['sort', 'limit', 'offset', 'fields']
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
                else myPayload[param] = value
            } else sortParams[param] = value
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
        if ('field' in payload && 'fields' in payload) { // todo: faire en sorte qu'ils peuvent l'être
            isValid = false
            paramError.error = 'Query error: fields and field cannot be in the same query';
        }
        console.log("sorting fields: ")
        console.log(myPayload)
        console.log("sort: ")
        console.log(sortParams)
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
        let field = paramQuery[0]
        let value = paramQuery[1];
        console.log(field)
        console.log(value)
        console.log("Param query:")
        console.log(paramQuery)
        if (!this.model.isMember(field)) {
            isvalid = false;
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
        /*if (Object.keys(param) == 'field') { // voir seulement ce field
            if (!this.model.isMember(param)) {
                isvalid = false;
                if (param.length < 1)
                    paramError.error = `Field parameter invalid.`;
                else
                    paramError.error = `${this.objectsName} does not contain the '${param}' property.`;
            }
            return [isvalid, param, paramError];
        } */ // fields voir ces propriétés...
            let fields = param.split(',');
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
    CheckLimitOffset(limit, offset) {

        let isvalid = true
        let paramError = { error: '' }
        //console.log(" limit: " + limit + " offset: " + offset);
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
