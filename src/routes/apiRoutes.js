const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verificarToken } = require('../middlewares/auth');

router.get('/stats', verificarToken, async (req, res) => {
  try {
    const [[{ empleados }]]  = await db.query('SELECT COUNT(*) as empleados FROM empleados WHERE activo = 1');
    const [[{ aptitudes }]]  = await db.query('SELECT COUNT(*) as aptitudes FROM aptitudes');
    const [[{ vencidos }]]   = await db.query("SELECT COUNT(*) as vencidos FROM carnets WHERE estado = 'vencido'");
    const [[{ proximos }]]   = await db.query("SELECT COUNT(*) as proximos FROM carnets WHERE estado = 'proximo'");

    res.json({ empleados, aptitudes, vencidos, proximos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/carnets/alertas', verificarToken, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, CONCAT(e.nombre, ' ', e.apellido) as empleado
      FROM carnets c
      JOIN empleados e ON c.empleado_id = e.id
      WHERE c.estado IN ('vencido', 'proximo')
      ORDER BY c.fecha_vencimiento ASC
      LIMIT 10
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Nueva ruta: devuelve todas las aptitudes (para el formulario inline)
router.get('/aptitudes', verificarToken, async (req, res) => {
  try {
    const [aptitudes] = await db.query('SELECT id, nombre FROM aptitudes ORDER BY nombre ASC');
    res.json(aptitudes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;