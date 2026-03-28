const db = require('../config/db');

const getAptitudes = async (req, res) => {
  try {
    const [aptitudes] = await db.query(`
      SELECT a.*, COUNT(ea.empleado_id) as total_empleados
      FROM aptitudes a
      LEFT JOIN empleado_aptitudes ea ON a.id = ea.aptitud_id
      GROUP BY a.id
      ORDER BY a.nombre ASC
    `);
    const success = req.query.success === '1';
    res.render('aptitudes', { aptitudes, usuario: req.usuario, error: null, success });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al cargar aptitudes');
  }
};

const postAptitud = async (req, res) => {
  const { nombre, descripcion } = req.body;
  try {
    await db.query('INSERT INTO aptitudes (nombre, descripcion) VALUES (?, ?)', [nombre, descripcion || null]);
    res.redirect('/aptitudes?success=1');
  } catch (error) {
    const [aptitudes] = await db.query(`
      SELECT a.*, COUNT(ea.empleado_id) as total_empleados
      FROM aptitudes a LEFT JOIN empleado_aptitudes ea ON a.id = ea.aptitud_id
      GROUP BY a.id ORDER BY a.nombre ASC
    `);
    res.render('aptitudes', {
      aptitudes, usuario: req.usuario,
      error: error.code === 'ER_DUP_ENTRY' ? 'Ya existe una puesto/cargo con ese nombre' : 'Error al guardar',
      success: false
    });
  }
};

const deleteAptitud = async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM aptitudes WHERE id = ?', [id]);
  res.redirect('/aptitudes');
};

const putAptitud = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion } = req.body;
  await db.query('UPDATE aptitudes SET nombre=?, descripcion=? WHERE id=?', [nombre, descripcion || null, id]);
  res.redirect('/aptitudes');
};

module.exports = { getAptitudes, postAptitud, deleteAptitud, putAptitud };