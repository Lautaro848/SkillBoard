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

// Usar memoryStorage — evita problemas de permisos en Hostinger
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

// Middleware que guarda el buffer al disco manualmente
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
    req.file = null; // Si falla, continúa sin foto
  }
  next();
};

router.get('/empleados',              verificarToken, getEmpleados);
router.get('/empleados/nuevo',        verificarToken, soloAdmin, getNuevoEmpleado);
router.post('/empleados',             verificarToken, soloAdmin, upload.single('foto'), guardarFoto, postEmpleado);
router.get('/empleados/:id/editar',   verificarToken, soloAdmin, getEditarEmpleado);
router.post('/empleados/:id/editar',  verificarToken, soloAdmin, upload.single('foto'), guardarFoto, putEmpleado);
router.post('/empleados/:id/borrar',  verificarToken, soloAdmin, deleteEmpleado);

module.exports = router;