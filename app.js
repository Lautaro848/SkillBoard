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
app.use('/', carnetsRoutes);
app.use('/', authRoutes);
app.use('/api', apiRoutes);
app.use('/', empleadosRoutes);
app.use('/', aptitudesRoutes);



app.get('/', (req, res) => res.redirect('/login'));
app.get('/tv', (req, res) => res.render('tv'));
app.get('/dashboard', verificarToken, (req, res) => {
  res.render('dashboard', { usuario: req.usuario });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(` Servidor corriendo en http://localhost:${PORT}`);
});