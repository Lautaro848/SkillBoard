const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

const authRoutes      = require('./src/routes/authRoutes');
const apiRoutes       = require('./src/routes/apiRoutes');
const empleadosRoutes = require('./src/routes/empleadosRoutes');
const aptitudesRoutes = require('./src/routes/aptitudesRoutes');
const { verificarToken } = require('./src/middlewares/auth');
const carnetsRoutes = require('./src/routes/carnetsRoutes');
const db = require('./src/config/db');
const db = require('./src/config/db');
const dayjs = require('dayjs');
app.use('/', carnetsRoutes);
app.use('/', authRoutes);
app.use('/api', apiRoutes);
app.use('/', empleadosRoutes);
app.use('/', aptitudesRoutes);



app.get('/', (req, res) => res.redirect('/login'));
app.get('/tv', async (req, res) => {
  try {
    const [empleados] = await db.query(`
      SELECT e.*,
        GROUP_CONCAT(DISTINCT a.nombre ORDER BY a.nombre SEPARATOR ', ') as aptitudes
      FROM empleados e
      LEFT JOIN empleado_aptitudes ea ON e.id = ea.empleado_id
      LEFT JOIN aptitudes a ON ea.aptitud_id = a.id
      WHERE e.activo = 1
      GROUP BY e.id
      ORDER BY e.apellido ASC
    `);

    const [carnets] = await db.query(`
      SELECT c.empleado_id, c.especialidad, c.fecha_vencimiento, c.estado
      FROM carnets c
      WHERE c.estado IN ('vigente', 'proximo')
      ORDER BY c.fecha_vencimiento ASC
    `);

    const dayjs = require('dayjs');
    const carnetsPorEmpleado = {};
    carnets.forEach(c => {
      if (!carnetsPorEmpleado[c.empleado_id]) carnetsPorEmpleado[c.empleado_id] = [];
      carnetsPorEmpleado[c.empleado_id].push({
        ...c,
        fecha_vencimiento_str: dayjs(c.fecha_vencimiento).format('DD/MM/YYYY')
      });
    });

    const empleadosConCarnets = empleados.map(e => ({
      ...e,
      carnets: carnetsPorEmpleado[e.id] || []
    }));

    const total = empleadosConCarnets.length;
    const visibleCards = total === 1 ? 1 : total === 2 ? 2 : 3;
    const cardWidth = visibleCards === 1 ? 600 : visibleCards === 2 ? 500 : 380;

    res.render('tv', { empleados: empleadosConCarnets, visibleCards, cardWidth });
  } catch (error) {
    console.error('[/tv]', error);
    res.status(500).send('Error: ' + error.message);
  }
});
app.get('/dashboard', verificarToken, (req, res) => {
  res.render('dashboard', { usuario: req.usuario });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(` Servidor corriendo en http://localhost:${PORT}`);
});