const express = require('express');
const router = express.Router();
const { verificarToken, soloAdmin, adminOSupervisor } = require('../middlewares/auth');
const { getCarnets, getNuevoCarnet, postCarnet, getEditarCarnet, putCarnet, deleteCarnet } = require('../controllers/carnetsController');

router.get('/carnets',                verificarToken, adminOSupervisor, getCarnets);
router.get('/carnets/nuevo',          verificarToken, soloAdmin, getNuevoCarnet);
router.post('/carnets',               verificarToken, soloAdmin, postCarnet);
router.get('/carnets/:id/editar',     verificarToken, soloAdmin, getEditarCarnet);
router.post('/carnets/:id/editar',    verificarToken, soloAdmin, putCarnet);
router.post('/carnets/:id/borrar',    verificarToken, soloAdmin, deleteCarnet);

module.exports = router;