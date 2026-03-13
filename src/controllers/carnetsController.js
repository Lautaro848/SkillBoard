const db = require('../config/db');
const dayjs = require('dayjs');

// Actualiza el estado de todos los carnets según fecha actual y dias_alerta
const actualizarEstados = async () => {
  await db.query(`
    UPDATE carnets SET estado = CASE
      WHEN fecha_vencimiento < CURDATE() THEN 'vencido'
      WHEN fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL dias_alerta DAY) THEN 'proximo'
      ELSE 'vigente'
    END
  `);
};

const getCarnets = async (req, res) => {
  try {
    await actualizarEstados();

    const filtroEstado = req.query.estado || '';
    const filtroEmpleado = req.query.empleado_id || '';

    let query = `
      SELECT c.*, CONCAT(e.apellido, ', ', e.nombre) as empleado_nombre, e.foto as empleado_foto
      FROM carnets c
      JOIN empleados e ON c.empleado_id = e.id
      WHERE e.activo = 1
    `;
    const params = [];

    if (filtroEstado) {
      query += ' AND c.estado = ?';
      params.push(filtroEstado);
    }
    if (filtroEmpleado) {
      query += ' AND c.empleado_id = ?';
      params.push(filtroEmpleado);
    }

    query += ' ORDER BY c.fecha_vencimiento ASC';

    const [carnets] = await db.query(query, params);
    const [empleados] = await db.query('SELECT id, nombre, apellido FROM empleados WHERE activo = 1 ORDER BY apellido ASC');

    const success = req.query.success === '1';

    res.render('carnets', {
      carnets,
      empleados,
      filtroEstado,
      filtroEmpleado,
      usuario: req.usuario,
      error: null,
      success
    });
  } catch (error) {
    console.error('[getCarnets]', error);
    res.status(500).send('Error al cargar carnets');
  }
};

const getNuevoCarnet = async (req, res) => {
  const [empleados] = await db.query('SELECT id, nombre, apellido FROM empleados WHERE activo = 1 ORDER BY apellido ASC');
  res.render('carnet_form', { carnet: null, empleados, usuario: req.usuario, error: null });
};

const postCarnet = async (req, res) => {
  const { empleado_id, especialidad, numero_carnet, fecha_emision, fecha_vencimiento, dias_alerta } = req.body;

  // Calcular estado inicial
  const hoy = dayjs();
  const vence = dayjs(fecha_vencimiento);
  const alerta = parseInt(dias_alerta) || 30;
  let estado = 'vigente';
  if (vence.isBefore(hoy)) estado = 'vencido';
  else if (vence.diff(hoy, 'day') <= alerta) estado = 'proximo';

  try {
    await db.query(
      `INSERT INTO carnets (empleado_id, especialidad, numero_carnet, fecha_emision, fecha_vencimiento, dias_alerta, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [empleado_id, especialidad, numero_carnet || null, fecha_emision, fecha_vencimiento, alerta, estado]
    );
    res.redirect('/carnets?success=1');
  } catch (error) {
    console.error('[postCarnet]', error);
    const [empleados] = await db.query('SELECT id, nombre, apellido FROM empleados WHERE activo = 1 ORDER BY apellido ASC');
    res.render('carnet_form', { carnet: null, empleados, usuario: req.usuario, error: 'Error al guardar el carnet: ' + error.message });
  }
};

const getEditarCarnet = async (req, res) => {
  const { id } = req.params;
  const [[carnet]] = await db.query('SELECT * FROM carnets WHERE id = ?', [id]);
  if (!carnet) return res.redirect('/carnets');
  const [empleados] = await db.query('SELECT id, nombre, apellido FROM empleados WHERE activo = 1 ORDER BY apellido ASC');
  res.render('carnet_form', { carnet, empleados, usuario: req.usuario, error: null });
};

const putCarnet = async (req, res) => {
  const { id } = req.params;
  const { empleado_id, especialidad, numero_carnet, fecha_emision, fecha_vencimiento, dias_alerta } = req.body;

  const hoy = dayjs();
  const vence = dayjs(fecha_vencimiento);
  const alerta = parseInt(dias_alerta) || 30;
  let estado = 'vigente';
  if (vence.isBefore(hoy)) estado = 'vencido';
  else if (vence.diff(hoy, 'day') <= alerta) estado = 'proximo';

  try {
    await db.query(
      `UPDATE carnets SET empleado_id=?, especialidad=?, numero_carnet=?, fecha_emision=?, fecha_vencimiento=?, dias_alerta=?, estado=? WHERE id=?`,
      [empleado_id, especialidad, numero_carnet || null, fecha_emision, fecha_vencimiento, alerta, estado, id]
    );
    res.redirect('/carnets');
  } catch (error) {
    console.error('[putCarnet]', error);
    res.redirect('/carnets');
  }
};

const deleteCarnet = async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM carnets WHERE id = ?', [id]);
  res.redirect('/carnets');
};

module.exports = { getCarnets, getNuevoCarnet, postCarnet, getEditarCarnet, putCarnet, deleteCarnet };