const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const {
  getEmpleados, getNuevoEmpleado, postEmpleado,
  getEditarEmpleado, putEmpleado, deleteEmpleado
} = require('../controllers/empleadosController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

const guardarFoto = (req, res, next) => {
  if (!req.file) return next();

  const uploadDir = path.join(__dirname, '../../public/uploads');
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = 'emp-' + unique + path.extname(req.file.originalname);
    fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
    req.file.filename = filename;
  } catch (err) {
    console.error('Error guardando foto:', err.message);
    req.file = null;
  }
  next();
};

// Wrapper para capturar MulterError y mostrar mensaje amigable
const uploadConManejo = (req, res, next) => {
  upload.single('foto')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        req.multerError = 'La foto es muy grande. El máximo permitido es 5MB.';
      } else {
        req.multerError = 'Error al subir la foto: ' + err.message;
      }
    } else if (err) {
      req.multerError = 'Error inesperado al subir la foto.';
    }
    next();
  });
};

router.get('/empleados',              verificarToken, getEmpleados);
router.get('/empleados/nuevo',        verificarToken, soloAdmin, getNuevoEmpleado);
router.post('/empleados',             verificarToken, soloAdmin, uploadConManejo, guardarFoto, postEmpleado);
router.get('/empleados/:id/editar',   verificarToken, soloAdmin, getEditarEmpleado);
router.post('/empleados/:id/editar',  verificarToken, soloAdmin, uploadConManejo, guardarFoto, putEmpleado);
router.post('/empleados/:id/borrar',  verificarToken, soloAdmin, deleteEmpleado);

module.exports = router;