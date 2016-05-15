const express = require('express')
const storage = require('lib/supervisor')

const router = express.Router()

router.get('/', (req, res) => {

  res.status(200).json(storage.get())
})

router.get('/head', (req, res) => {

  console.log(storage.head())
  res.status(200).json(storage.head())
})

router.post('/', (req, res) => { 
  supervisor(req.body, (err, result) => {
    err ? res.status(500).json(err) :
      res.status(200).json(result)
  })
})

module.exports = router
