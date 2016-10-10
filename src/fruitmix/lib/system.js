import fs from 'fs'
import path from 'path'

import paths from './paths'
import models from '../models/models'
import { createUserModelAsync } from '../models/userModel'
import { createDriveModelAsync } from '../models/driveModel'
import { createFiler } from './filer'
import { createRepo } from './repo'
import createUUIDLog from './uuidlog'
import { createDocumentStore } from './documentStore'
import { createMediaShareStore } from './mediaShareStore'
import createMedia from './media'
import createThumbnailer from './thumbnail'

const initAsync = async (sysroot) => {

  // set sysroot to paths
  await paths.setRootAsync(sysroot)
  console.log(`sysroot is set to ${sysroot}`)

  let modelPath = paths.get('models')
  let tmpPath = paths.get('tmp')

  // create and set user model
  let userModelPath = path.join(modelPath, 'users.json')
  let userModel = await createUserModelAsync(userModelPath, tmpPath)
  models.setModel('user', userModel)

  // create and set drive model
  let driveModelPath = path.join(modelPath, 'drives.json')
  let driveModel = await createDriveModelAsync(driveModelPath, tmpPath)
  models.setModel('drive', driveModel)

  // create repo
  let repo = createRepo(driveModel)
  models.setModel('filer', repo.filer)
  models.setModel('repo', repo) 
  repo.init(err => err ? console.log(err) : null)

  // create thumbnailer facility
  let thumbnailer = createThumbnailer()
  models.setModel('thumbnailer', thumbnailer)

  // create uuid log facility
  let logpath = paths.get('log')
  let log = createUUIDLog(logpath)
  models.setModel('log', log)

  // the following should be merged into media, like repo

  // create document store
  let docPath = paths.get('documents')
  let docstore = await Promise.promisify(createDocumentStore)(docPath, tmpPath)

  // create mediashare store
  let mediasharePath = paths.get('mediashare')  
  let mediashareArchivePath = paths.get('mediashareArchive')
  let msstore = createMediaShareStore(mediasharePath, mediashareArchivePath, tmpPath, docstore) 

  // create media ???
  let media = createMedia(msstore)
  models.setModel('media', media)

}

const deinit = () => {
  // there will be race conditon !!! FIXME
  models.clear()
  paths.unsetRoot()  
}

export default {
  init: (sysroot, callback) => initAsync(sysroot).asCallback(callback),
  deinit
}


