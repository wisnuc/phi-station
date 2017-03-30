const path = require('path')
const rimraf = require('rimraf')
const fs = Promise.promisifyAll(require('fs'))
import { readXstat, readXstatAsync, updateFileHashAsync } from './xstat'
import DirectoryNode from './directoryNode'
import FileNode from './fileNode'
import E from '../lib/error'
class FileService {

  constructor(froot, data, shareData) {
    this.froot = froot
    this.data = data 
    this.shareData = shareData
  }

  nodeProps(node) {
    if (node instanceof DirectoryNode) {
      return {
        uuid: node.uuid,
        type: 'folder',
        name: node.name,
        mtime: node.mtime
      }
    }
    else if (node instanceof FileNode) {
      return {
        uuid: node.uuid,
        type: 'file',
        name: node.name,
        size: node.size,
        mtime: node.mtime // FIXME: need change mtime definition      
      }
    }
  }

  userReadable(userUUID, node) {

    return this.data.userPermittedToRead(userUUID, node)
      || this.shareData.userAuthorizedToRead(userUUID, node)
  }

  userWritable(userUUID, node) {

    return this.data.userPermittedToWrite(userUUID, node)
      || this.shareData.userAuthorizedToWrite(userUUID, node)
  }  

  // list all items inside a directory
  async list({ userUUID, dirUUID }) {

    let node = this.data.findNodeByUUID(dirUUID)
  
    if (!node) throw new E.NODENOTFOUND() 
    if (!node.isDirectory()) throw new E.ENOTDIR()
    if (!(this.userReadable(userUUID, node))) throw new E.EACCESS()

    return node.getChildren().map(n => this.nodeProps(n))
  }

  // list all items inside a directory, with given
  // rootUUID must be a fileshare uuid or virtual drive uuid.
  async navList({ userUUID, dirUUID, rootUUID }) {

    let node = this.data.findNodeByUUID(dirUUID)
    let root = this.data.findNodeByUUID(rootUUID)
  
    if (!node || !root) throw new E.NODENOTFOUND() 
    if (!node.isDirectory()) throw new E.ENOTDIR()
    if (!(this.userReadable(userUUID, node))) throw new E.EACCESS()

    let path = node.nodepath()
    let index = path.indexOf(root)

    if (index === -1) throw new E.ENOENT()
    let subpath = path.slice(index)
    
    return {
      path: subpath.map(n => this.nodeProps(n)),
      entries: node.getChildren().map(n => this.nodeProps(n))
    }
  }

  // list all tree inside a directory
  async tree({ userUUID, dirUUID }) {
    
    let node = this.data.findNodeByUUID(dirUUID)
  
    if (!node) throw new E.NODENOTFOUND() 
    if (!node.isDirectory()) throw new E.ENOTDIR()
    if (!(this.userReadable(userUUID, node))) throw new E.EACCESS()
  }

  // list all tree inside a directory, with given
  // rootUUID must be a fileshare uuid or virtual drive uuid.
  async navTree({ userUUID, dirUUID, rootUUID }) {

    let node = this.data.findNodeByUUID(dirUUID)
    let root = this.data.findNodeByUUID(rootUUID)
  
    if (!node || !root) throw new E.NODENOTFOUND() 
    if (!node.isDirectory()) throw new E.ENOTDIR()
    if (!(this.userReadable(userUUID, node))) throw new E.EACCESS()
   
  }

  // return abspath of file
  async readFile({ userUUID, dirUUID, fileUUID }) {

    let dirNode = this.data.findNodeByUUID(dirUUID)
    let fileNode = this.data.findNodeByUUID(fileUUID)

    if (!dirNode || !fileNode) throw new E.NODENOTFOUND() 
    if (!dirNode.isDirectory()) throw new E.ENOTDIR()
    if (!fileNode.isFile()) throw new E.ENOENT()
    if (!(this.userReadable(userUUID, dirNode))) throw new E.EACCESS()

    return fileNode.abspath()
  }

  // dump a whole drive
  dumpDrive(userUUID, driveUUID) {
  }

  // create new directory inside given dirUUID
  createDirectory({ userUUID, dirUUID, name }, callback) {

    // permission check
    let node = this.data.findNodeByUUID(dirUUID)
    if (!targetNode.isDirectory()) {
      let error = new Error('createFolder: target should be a folder')
      error.code = 'EINVAL' 
      return process.nextTick(callback, error)
    }

    // if not writable, EACCESS
    if (!targetNode.userWritable(userUUID)) {
      let error = new Error('createFolder: operation not permitted')
      error.code = 'EACCESS'
      return process.nextTick(callback, error)
    }

    // if already exists, EEXIST
    if (this.list(userUUID, dirUUID).find(child => child.name == name)) {
      let error = new Error('createFolder: file or folder already exists')
      error.code = 'EEXIST'
      return process.nextTick(callback, error)
    }

    //create new folder
    fs.mkdir(targetpath, err => {
      if(err) return callback(err)
      readXstat(targetpath, (err, xstat) => {
        //create new node
        let node = this.data.createNode(targetNode, xstat)
        callback(null, node)
      })
    })

  }

  // create new file inside given dirUUID, 
  createFile(args, callback) {
    let  { userUUID, srcpath, dirUUID, name, sha256 } = args
    let targetNode = this.data.findNodeByUUID(dirUUID)

    if (!targetNode.isDirectory()) {
      let error = new Error('createFile: target must be a folder')
      error.code = 'EINVAL'
      return process.nextTick(callback, error)
    }

    // user permission check
    if (!targetNode.userWritable(userUUID)) {
      let error = new Error('createFile: operation not permitted')
      error.code = 'EACCESS'
      return process.nextTick(callback, error)
    } 

    if (this.list(userUUID, dirUUID).find(child => child.name == name)) {
      let error = new Error('createFile: file or folder already exists')
      error.code = 'EEXIST'
      return process.nextTick(callback, error)
    }

    let targetpath = path.join(targetNode.namepath(), name)

    //rename file 
    fs.rename(srcpath, targetpath, err => {
      if (err) return callback(err)
      readXstat(targetpath, (err, xstat) => {
        //create new node
        let node = this.data.createNode(targetNode, xstat)
        callback(null, node)
      })
    })

  }

  /**
  // create new file before check
  createFileCheck(args, callback){
    let { userUUID, dirUUID, name } = args
    let node = this.data.findNodeByUUID(dirUUID)
    if(!node || userCanRead(userUUID, node))
      return callback(new Error('Permission denied'))
    if(node.isDirectory() && this.list(userUUID, dirUUID).find(child => child.name == name && child.type === 'file'))
      return callback(new Error('File exist')) // TODO
    callback(null, node)
  }
  **/

  // check must be provided as boolean
  // early return null if check is true
  // name must be valid filename, this can be asserted with sanitize-filename TODO
  // src must be absolute path
  // hash is optional, if it is provided, it is trusted
  async createFileAsync(args) {

    let { userUUID, dirUUID, name, src, hash, check } = args

    // if check is true
    // userUUID, dirUUID, name, mandatory  
    // if check is false
    // userUUID, dirUUID, name, src, mandatory; hash optional

    let node = this.data.findNodeByUUID(dirUUID)
    if (!node) throw new E.NODENOTFOUND()
    if (!node.isDirectory()) throw new E.ENOTDIR()
    if (!this.userWritable(userUUID, node)) throw new E.EACCESS()
    if (node.getChildren().map(n => n.name).includes(name)) throw new E.EEXIST()

    if (check === true) return null

    let dst = path.join(node.abspath(), name)

    try {

      // if failed, it is highly likely the path is invalid, so dir node should be probed
      await fs.renameAsync(src, dst)

      // read xstat
      let xstat = await readXstatAsync(dst) 

      // update hash if available
      if (hash) { 
        // no need to try / catch, we probe anyway
        xstat = await updateFileHashAsync(dst, xstat.uuid, hash, xstat.mtime)
      }

      // create node
      return this.data.createNode(node, xstat)
    }
    catch (e) {
      throw e
    }
    finally {
      this.data.requestProbeByUUID(dirUUID)
    }
  }

  // overwrite existing file
  overwriteFile({ userUUID, srcpath, fileUUID }, callback) {
  }

  // rename a directory or file
  rename(userUUID, targetUUID, name, callback) {
  }

  // move a directory or file into given dirUUID
  move(userUUID, srcUUID, dirUUID, callback) {
  }

  // delete a directory or file
  // dirUUID cannot be a fileshare UUID
  async del({ userUUID, dirUUID, nodeUUID }) {

    let share = this.shareData.fsMap.get(dirUUID)
    if(share) throw new E.ENOENT()

    let node = this.data.findNodeByUUID(nodeUUID)
    let dirNode = this.data.findNodeByUUID(dirUUID)

    if (!node) throw new E.NODENOTFOUND()
    if (!dirNode) throw new E.NODENOTFOUND()

    if (!this.userWritable(userUUID, dirNode)) throw new E.EACCESS()

    //FIXME: 
    // rimraf(node.namepath(), err => {
    //   if (err) throw (err)
    //   this.deleteSubTree(node)
    //   return 
    // })
  }

  // for debug
  printFiles(args, callback) {
    let data = this.data.print()
    console.log('printFiles', data)
    process.nextTick(() => callback(null, data))
  }

  register(ipc){

    // ipc.register('createFileCheck', this.createFileCheck.bind(this))

    // ipc.register('createFile', this.createFile.bind(this))
    ipc.register('createFile', (args, callback) => 
      this.createFileAsync(args).asCallback(callback))

    ipc.register('createDirectory', this.createDirectory.bind(this))
    ipc.register('overwriteFile', this.overwriteFile.bind(this))
    ipc.register('list', (args, callback) => this.list(args).asCallback(callback))
    ipc.register('navList', (args, callback) => this.navList(args).asCallback(callback))
    ipc.register('tree', (args, callback) => this.tree(args).asCallback(callback))
    ipc.register('navTree', (args, callback) => this.navTree(args).asCallback(callback))
    ipc.register('readFile', this.readFile.bind(this))
    ipc.register('del', this.del.bind(this))

    ipc.register('printFiles', this.printFiles.bind(this)) 
  }
}

export default FileService
