const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verificarToken, soloAdmin } = require('../middlewares/auth');

// Leer config actual
router.get('/tv/config', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [[config]] = await db.query('SELECT * FROM config_tv WHERE id = 1');
    // Obtener áreas únicas de empleados (si querés filtrar por área en el futuro
    // por ahora usamos una lista simple)
    res.render('tv_config', { config, usuario: req.usuario, success: req.query.success === '1' });
  } catch (error) {
    console.error('[GET /tv/config]', error);
    res.status(500).send('Error: ' + error.message);
  }
});

// Guardar config
router.post('/tv/config', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { velocidad_seg, mostrar_todos, area_filtro } = req.body;
    await db.query(
      'UPDATE config_tv SET velocidad_seg=?, mostrar_todos=?, area_filtro=? WHERE id=1',
      [
        parseInt(velocidad_seg) || 5,
        mostrar_todos === 'on' || mostrar_todos === '1' ? 1 : 0,
        area_filtro && area_filtro.trim() ? area_filtro.trim() : null
      ]
    );
    res.redirect('/tv/config?success=1');
  } catch (error) {
    console.error('[POST /tv/config]', error);
    res.redirect('/tv/config');
  }
});

module.exports = router;