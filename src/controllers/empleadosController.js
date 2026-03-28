const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');

const calcularEstadoCarnet = (fechaVencimiento, diasAlerta = 30) => {
  const hoy = dayjs();
  const vence = dayjs(fechaVencimiento);

  if (!vence.isValid()) return 'vigente';
  if (vence.isBefore(hoy, 'day')) return 'vencido';
  if (vence.diff(hoy, 'day') <= diasAlerta) return 'proximo';
  return 'vigente';
};

const getEmpleados = async (req, res) => {
  try {
    const busqueda = req.query.busqueda || '';
    const aptitud_id = req.query.aptitud_id || '';

    let query = `
      SELECT e.*, 
        GROUP_CONCAT(a.nombre SEPARATOR ', ') as aptitudes
      FROM empleados e
      LEFT JOIN empleado_aptitudes ea ON e.id = ea.empleado_id
      LEFT JOIN aptitudes a ON ea.aptitud_id = a.id
      WHERE e.activo = 1
    `;
    const params = [];

    if (busqueda) {
      query += ` AND (e.nombre LIKE ? OR e.apellido LIKE ? OR e.legajo LIKE ?)`;
      params.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
    }

    if (aptitud_id) {
      query += ` AND ea.aptitud_id = ?`;
      params.push(aptitud_id);
    }

    query += ` GROUP BY e.id ORDER BY e.apellido ASC`;

    const [empleados] = await db.query(query, params);
    const [aptitudes] = await db.query('SELECT * FROM aptitudes ORDER BY nombre ASC');

    res.render('empleados', {
      empleados,
      aptitudes,
      busqueda,
      aptitud_id,
      usuario: req.usuario
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al cargar empleados');
  }
};

const getNuevoEmpleado = async (req, res) => {
  const [aptitudes] = await db.query('SELECT * FROM aptitudes ORDER BY nombre ASC');
  res.render('empleado_form', { empleado: null, aptitudes, usuario: req.usuario, error: null, carnetsDraft: [] });
};

const postEmpleado = async (req, res) => {
  // Si multer falló (ej: archivo muy grande), mostrar error amigable
  if (req.multerError) {
    const [aptitudes] = await db.query('SELECT * FROM aptitudes ORDER BY nombre ASC');
    return res.render('empleado_form', { empleado: null, aptitudes, usuario: req.usuario, error: req.multerError });
  }

  const {
    nombre,
    apellido,
    legajo,
    aptitudes_sel,
    carnet_especialidad,
    carnet_numero,
    carnet_fecha_emision,
    carnet_fecha_vencimiento,
    carnet_dias_alerta
  } = req.body;
  const foto = req.file ? req.file.filename : null;

  try {
    const [result] = await db.query(
      'INSERT INTO empleados (nombre, apellido, legajo, foto) VALUES (?, ?, ?, ?)',
      [nombre, apellido, legajo, foto]
    );

    const empleadoId = result.insertId;

    if (aptitudes_sel) {
      const aptIds = Array.isArray(aptitudes_sel) ? aptitudes_sel : [aptitudes_sel];
      for (const aid of aptIds) {
        await db.query(
          'INSERT INTO empleado_aptitudes (empleado_id, aptitud_id) VALUES (?, ?)',
          [empleadoId, aid]
        );
      }
    }

    const toArray = (value) => (Array.isArray(value) ? value : (value ? [value] : []));
    const especialidades = toArray(carnet_especialidad);
    const numeros = toArray(carnet_numero);
    const emisiones = toArray(carnet_fecha_emision);
    const vencimientos = toArray(carnet_fecha_vencimiento);
    const alertas = toArray(carnet_dias_alerta);

    for (let i = 0; i < especialidades.length; i++) {
      const especialidad = (especialidades[i] || '').trim();
      const fecha_emision = emisiones[i];
      const fecha_vencimiento = vencimientos[i];

      // Ignorar filas vacías sin romper el alta de empleado
      if (!especialidad && !fecha_emision && !fecha_vencimiento) continue;
      if (!especialidad || !fecha_emision || !fecha_vencimiento) continue;

      const dias_alerta = parseInt(alertas[i], 10) || 30;
      const estado = calcularEstadoCarnet(fecha_vencimiento, dias_alerta);

      await db.query(
        `INSERT INTO carnets (empleado_id, especialidad, numero_carnet, fecha_emision, fecha_vencimiento, dias_alerta, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          empleadoId,
          especialidad,
          (numeros[i] || '').trim() || null,
          fecha_emision,
          fecha_vencimiento,
          dias_alerta,
          estado
        ]
      );
    }

    res.redirect('/empleados');
  } catch (error) {
    console.error('[postEmpleado] ERROR:', error);
    const [aptitudes] = await db.query('SELECT * FROM aptitudes ORDER BY nombre ASC');
    const toArray = (value) => (Array.isArray(value) ? value : (value ? [value] : []));
    const especialidades = toArray(carnet_especialidad);
    const numeros = toArray(carnet_numero);
    const emisiones = toArray(carnet_fecha_emision);
    const vencimientos = toArray(carnet_fecha_vencimiento);
    const alertas = toArray(carnet_dias_alerta);
    const carnetsDraft = especialidades.map((especialidad, i) => ({
      especialidad: especialidad || '',
      numero: numeros[i] || '',
      fecha_emision: emisiones[i] || '',
      fecha_vencimiento: vencimientos[i] || '',
      dias_alerta: alertas[i] || '30'
    }));
    res.render('empleado_form', {
      empleado: null,
      aptitudes,
      usuario: req.usuario,
      carnetsDraft,
      error: error.code === 'ER_DUP_ENTRY' ? 'El legajo ya existe' : ('Error al guardar: ' + error.message)
    });
  }
};

const getEditarEmpleado = async (req, res) => {
  const { id } = req.params;
  const [[empleado]] = await db.query('SELECT * FROM empleados WHERE id = ?', [id]);
  if (!empleado) return res.redirect('/empleados');

  const [aptitudes] = await db.query('SELECT * FROM aptitudes ORDER BY nombre ASC');
  const [aptSel] = await db.query('SELECT aptitud_id FROM empleado_aptitudes WHERE empleado_id = ?', [id]);
  empleado.aptitudes_sel = aptSel.map(a => a.aptitud_id);

  res.render('empleado_form', { empleado, aptitudes, usuario: req.usuario, error: null, carnetsDraft: [] });
};

const putEmpleado = async (req, res) => {
  const { id } = req.params;
  const { nombre, apellido, legajo, aptitudes_sel } = req.body;

  console.log('[putEmpleado] req.file:', req.file ? 'presente' : 'null');

  try {
    const [[emp]] = await db.query('SELECT foto FROM empleados WHERE id = ?', [id]);
    let foto = emp.foto;

    if (req.file) {
      // Intentar borrar la foto vieja, pero si falla no importa
      if (foto) {
        try {
          const oldPath = path.join(__dirname, '../../public/uploads', foto);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (e) {
          console.log('[putEmpleado] No se pudo borrar foto vieja (ignorado):', e.message);
        }
      }
      foto = req.file.filename;
    }

    await db.query(
      'UPDATE empleados SET nombre=?, apellido=?, legajo=?, foto=? WHERE id=?',
      [nombre, apellido, legajo, foto, id]
    );

    await db.query('DELETE FROM empleado_aptitudes WHERE empleado_id = ?', [id]);
    if (aptitudes_sel) {
      const aptIds = Array.isArray(aptitudes_sel) ? aptitudes_sel : [aptitudes_sel];
      for (const aid of aptIds) {
        await db.query(
          'INSERT INTO empleado_aptitudes (empleado_id, aptitud_id) VALUES (?, ?)',
          [id, aid]
        );
      }
    }

    res.redirect('/empleados');
  } catch (error) {
    console.error('[putEmpleado] ERROR:', error);
    res.redirect('/empleados');
  }
};

const deleteEmpleado = async (req, res) => {
  const { id } = req.params;
  await db.query('UPDATE empleados SET activo = 0 WHERE id = ?', [id]);
  res.redirect('/empleados');
};

module.exports = { getEmpleados, getNuevoEmpleado, postEmpleado, getEditarEmpleado, putEmpleado, deleteEmpleado };
