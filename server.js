	require('dotenv').config();

	// Importar módulos necesarios
	const express = require('express');
	const http = require('http');
	const socketIo = require('socket.io');
	const https = require('https');
	const fs = require('fs');
	const path = require('path');
	const cors = require('cors');
	const session = require('express-session');
	const axios = require("axios");

	// Almacenar llamadas perdidas por usuario
	const missedCalls = {};

	// Crear una instancia de Express
	const app = express();

	// Configuración de sesiones
	app.use(
		session({
			secret: 'vp2p_fjbh3476sdhfhjdfdstreh3hbsdjbf873', // Cambia esto por una clave secreta única
			resave: false,
			saveUninitialized: false,
			cookie: { secure: false }, // Cambia a `true` si usas HTTPS
		})
	);
		
	// Middleware para analizar datos del formulario
	app.use(express.urlencoded({ extended: true }));

	// Ruta para servir archivos estáticos excepto index.html
	app.use(
	  express.static(path.join(__dirname, "public"), {
		index: false, // Desactiva la carga automática de index.html
	  })
	);

	// Ruta principal: mostrar login.html
	app.get("/", (req, res) => {
	  res.sendFile(path.join(__dirname, "public", "login.html"));
	});

	// Ruta para validar al usuario
	app.post("/login", async (req, res) => {
	  const { user, password } = req.body;

		try 
		{
			// Solicitud al archivo PHP para obtener dos JSON en la misma respuesta
			// const response = await axios.get(`http://localhost/videop2p/validateUser.php?user=${user}&password=${password}`);
			const response = await axios.get(`${process.env.BASE_URL}/validateUser.php?user=${user}&password=${password}`);



			const data = response.data; // JSON recibido
			const data1 = data.validation; // Primer JSON (validación del usuario)
			const data2 = data.additionalInfo; // Segundo JSON (información adicional)

			if (data1.status === 1 && data2) {
				// Usuario validado, guardamos información en la sesión
				req.session.authenticated = true;
				req.session.id_user = data1.id_user; // id del usuario en la db desde el primer JSON
				req.session.username = data1.nombre; // Nombre del usuario desde el primer JSON
				req.session.descripcion = data1.descripcion; // descripcion del usuario desde el primer JSON
				req.session.additionalInfo = data2; // Información adicional desde el segundo JSON

				id_user = data1.id_user;
				mov='Ingreso a sistema';
				axios.get(`${process.env.BASE_URL}/insertMov.php?id_user=${id_user}&mov=${mov}`);

				// Redirigir a la página principal
				res.redirect("/index.html");
			} 
			else {
				// Usuario no válido
				req.session.authenticated = false;
				res.send(
					`
					<div class="container">
					<h1>Usuario no encontrado</h1>
					<a href="/">Volver a intentar</a>
					</div>  
				`
				);
			}
		} 
		catch (error) 
		{
			// console.error("Error al validar el usuario:", error);
			console.error("Error al validar el usuario:");
			res.status(500).sendFile(path.join(__dirname, 'public/500/500.html'));
		}
	});


	// Ruta para devolver datos de la sesión
	app.get("/user-info", (req, res) => {
	  if (req.session.authenticated) {
		res.json({
		  id_user: req.session.id_user,
		  username: req.session.username,
		  descripcion: req.session.descripcion,
		  additionalInfo: req.session.additionalInfo,
		});
	  } else {
		res.status(401).json({ error: "No autorizado" });
	  }
	});


	// Middleware para proteger index.html
	app.get("/index.html", (req, res) => {
	  if (req.session.authenticated) {
		res.sendFile(path.join(__dirname, "public", "index.html"));
	  } else {
		res.redirect("/");
	  }
	});


	// Ruta para obtener llamadas perdidas
	app.get('/missed-calls', (req, res) => {
		const username = req.session.username;
		if (missedCalls[username]) {
			res.json({ missedCalls: missedCalls[username] });
			missedCalls[username] = []; // Limpiar las llamadas perdidas después de enviarlas
		} else {
			res.json({ missedCalls: [] });
		}
	});



// --------------------------------------------------------------------------
// --------------------------------------------------------------------------


	const server = http.createServer(app);
	const io = socketIo(server);


	// Servir archivos estáticos (como HTML, CSS y JS)
	app.use(express.static('public'));
	app.use(express.json({ limit: '50mb' })); // Para recibir datos de grabación grandes



// -------------------------------- WEBRTC -----------------------------------------
// ---------------------------------------------------------------------------------

					// Almacenar los usuarios conectados con su identificador personalizado y sala
					const users = {};

					// Endpoint para recibir la grabación
					app.post('/saveRecording', (req, res) => {
						const { data, fileName } = req.body;

						// Decodificar el archivo de grabación
						const buffer = Buffer.from(data, 'base64');

						// Crear la carpeta de grabaciones si no existe
						const recordingsDir = path.join(__dirname, 'recordings');
						if (!fs.existsSync(recordingsDir)) {
							fs.mkdirSync(recordingsDir);
						}

						// Escribir el archivo con el nombre correspondiente
						const filePath = path.join(recordingsDir, fileName);
						fs.writeFile(filePath, buffer, err => {
							if (err) {
								console.error('Error al guardar la grabación:', err);
								return res.status(500).send('Error al guardar la grabación');
							}
							console.log('Grabación guardada:', filePath);
							res.status(200).send('Grabación guardada exitosamente');
						});
					});



				// -------------------- NUEVO USUARIO ----------------------------------------------
				// ---------------------------------------------------------------------------------


				// Manejar nuevas conexiones de usuarios
				io.on('connection', socket => {					
						console.log(`1.- Usuario nuevo : ${socket.id}`);
						// Escuchar cuando el usuario envía su identificador personalizado y la sala
						socket.on('register', ({ id_user, username, descripcion, roomName }) => {
							// Validar que el usuario envió un nombre y una sala válidos							
							if (!username || !roomName || username.trim() === '' || roomName.trim() === '') {
								console.log(`El usuario con socket ID ${socket.id} intentó registrarse sin nombre o sala.`);
								return;
							}
							
							// Si el usuario ya está registrado en una sala, salir de esa sala
							if (users[socket.id]) {
								const oldRoom = users[socket.id].room; // Sala anterior
								if (oldRoom) {
									// Emitir lista actualizada en la sala antigua antes de que el usuario se registre en una nueva
									socket.leave(oldRoom); // El usuario deja la sala anterior
									console.log(`Usuario ${users[socket.id].username} dejó la sala ANTIGUA: ${oldRoom}`);

									// Emitir la lista actualizada de usuarios en la sala antigua
									const usersInOldRoom = Object.values(users)
										.filter(user => user.room === oldRoom)
										.map(user => ({
											username: user.username,
											id_user: user.id_user,
											description: user.descripcion // Incluir el campo "descripcion"b
										}));	
									io.to(oldRoom).emit('users', usersInOldRoom);
								}
							}
							
							// Registrar al usuario en la nueva sala
							users[socket.id] = { id_user: id_user, username: username.trim(), room: roomName.trim(), descripcion: descripcion.trim() };
							console.log(`Usuario registrado id: ${id_user} -- ${username} en la sala: ${roomName} -- descripcion: ${descripcion} -- (Socket ID: ${socket.id})`);
							
							// Unir al usuario a la nueva sala
							users[socket.id].room = roomName;
							socket.join(roomName);
							
							// Emitir la lista actualizada de usuarios en la nueva sala
							const usersInRoom = Object.values(users)
								.filter(user => user.room === roomName)
								.map(user => ({
									username: user.username,
									id_user: user.id_user,
									description: user.descripcion // Incluir el campo "descripcion"
								}));								
							io.to(roomName).emit('users', usersInRoom);	

							mov='ingreso a sala id:'+roomName;
							axios.get(`${process.env.BASE_URL}/insertMov.php?id_user=${id_user}&mov=${mov}`);	
						});



						// Manejar la señalización de WebRTC
						// Acá cuando se está intentando llamar a otro usuario
						socket.on('signal', data => {
							if (data.target) {
								console.log('objetivo: '+data.target+' id:'+data.id_userOrigin);
								id_userOrigin=data.id_userOrigin;

								// Verificar que el usuario que llama está registrado en la lista de usuarios
								if (!users[socket.id]) {
									socket.emit('error', { message: 'El usuario que llama no está registrado.' });
									return;
								}

								// Encontrar el socket.id del usuario objetivo
								const targetSocketId = Object.keys(users).find(
									id => users[id].username === data.target
								);

								const roomNameError = users[socket.id]?.room;
								// Verificar que el usuario objetivo existe
								if (!targetSocketId) {
									socket.emit('error', { value:1, message: `El usuario objetivo ${data.target} no está registrado.`, room:roomNameError });
									console.log('error en llamada 1000');
									return;
								}

								// Verificar que ambos usuarios están en la misma sala
								if (users[socket.id].room !== users[targetSocketId].room) {
									socket.emit('error', { value:2, message: 'Ambos usuarios deben estar en la misma sala para realizar la llamada.', room:roomNameError });
									console.log('error en llamada 2000');
									return;
								}

								if (targetSocketId) {
									// Emitir la señal al usuario objetivo en la misma sala
									io.to(targetSocketId).emit('signal', { sender: users[socket.id].username, ...data });
								} else {
									console.log(`Usuario objetivo ${data.target} no encontrado en la sala ${users[socket.id].room}.`);
								}
							} 
							else {
								console.log('error en llamada 3000');
								// socket.emit('error', { message: 'No se especificó un usuario objetivo para la señal.' });
							}
						});




						// Actualizar lista usuarios de la sala
						socket.on('update_room', ({ roomName }) => {
							console.log('Actualizar sala: '+roomName);
							// Emitir la lista actualizada de usuarios en la nueva sala
							const usersInRoom = Object.values(users)
								.filter(user => user.room === roomName)
								.map(user => ({
									username: user.username,
									id_user: user.id_user,
									description: user.descripcion // Incluir el campo "descripcion"
								}));								
							io.to(roomName).emit('users', usersInRoom);
						});




						// Manejar cambios en el estado de ocupado/libre de los usuarios en la misma sala
						socket.on('user-busy', ({ userId, busy }) => {
							const roomName = users[socket.id]?.room;
							if (roomName) {
								io.to(roomName).emit('user-busy', { userId: users[socket.id].username, busy });
							}
						});



						// Manejar llamada perdida
						socket.on('miss-call-user', ({ id_userOrigin, nameUser, busy }) => {							
							socket.emit('miss-call-user', { id_userOrigin: id_userOrigin, nameUser:nameUser });							
						});



						// Evento para cuando un usuario rechaza una llamada
						socket.on('call-rejected', (targetUserId) => {
							// Informar al usuario que realizó la llamada y al usuario que rechazó la llamada
							const roomName = users[socket.id]?.room
							if (roomName) {
								io.to(roomName).emit('user-busy', { userId: targetUserId, busy: false });
								io.to(roomName).emit('user-busy', { userId: users[socket.id].username, busy: false });
							}
						});
						
						

						// Evento para cuando un usuario cancela una llamada
						socket.on('cancel-call', targetUserId => {
							const targetSocketId = Object.keys(users).find(
								id => users[id].username === targetUserId && users[id].room === users[socket.id].room
							);
							if (targetSocketId) {
								io.to(targetSocketId).emit('call-canceled'); // Notificar al receptor que la llamada fue cancelada
							}
							// Restablecer el estado de ambos usuarios a no ocupados
							const roomName = users[socket.id]?.room;
							if (roomName) {
								io.to(roomName).emit('user-busy', { userId: targetUserId, busy: false });
								io.to(roomName).emit('user-busy', { userId: users[socket.id].username, busy: false });
							}
						});



						// Evento para manejar el fin de la llamada
						socket.on('end-call', ({ userId, targetUserId }) => {
							const roomName = users[socket.id]?.room;
							if (roomName) {
								// Notificar a todos en la sala que los usuarios ya no están ocupados
								io.to(roomName).emit('user-busy', { userId, busy: false });
								io.to(roomName).emit('user-busy', { userId: targetUserId, busy: false });
								let userCall=users[socket.id].id_user;
								mov='Fin de llamada entre '+userId+' y '+targetUserId;
								axios.get(`${process.env.BASE_URL}/insertMov.php?id_user=${userCall}&mov=${mov}`);	
							}
						});
						


						// Evento para manejar llamada perdida
						socket.on('missed-call', targetUserId => {
							const targetSocketId = Object.keys(users).find(id => users[id].username === targetUserId && users[id].room === users[socket.id].room);
							if (targetSocketId) {
								io.to(targetSocketId).emit('call-missed'); // Notificar al receptor de la llamada PERDIDA
							}
							// Restablecer el estado de ambos usuarios a no ocupados
							const roomName = users[socket.id]?.room;
							if (roomName) {
								io.to(roomName).emit('user-busy', { userId: targetUserId, busy: false });
								io.to(roomName).emit('user-busy', { userId: users[socket.id].username, busy: false });
							}
						});
						
						
						
						// Cuando un usuario se desconecta
						socket.on('disconnect', () => {
							console.log(`3.- Usuario desconectado: ${socket.id}`);

							// Eliminar el usuario de la lista y emitir la lista actualizada a la sala correspondiente
							if (users[socket.id]) {
								id_user=users[socket.id].id_user;
								const { username, room } = users[socket.id];
								const oldRoom = users[socket.id].room; // Sala anterior
								delete users[socket.id];
								console.log(`3.1.- Usuario desconectado: ${username} de la sala ${room}`);
								
								mov=(`Salida sistema: Usuario ${username} desconectado de la sala ${room}`);
								axios.get(`${process.env.BASE_URL}/insertMov.php?id_user=${id_user}&mov=${mov}`);
								
								// Emitir la lista actualizada de usuarios en la sala
								const usersInRoom = Object.values(users)
									.filter(user => user.room === oldRoom)
									.map(user => ({
										username: user.username,
										id_user: user.id_user,
										description: user.descripcion // Incluir el campo "descripcion"
									}));
								io.to(oldRoom).emit('users', usersInRoom);	
							}
						});
						
						
				});
				
				
// ---------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------


	app.post('/logout', (req, res) => {
		req.session.destroy((err) => {
			if (err) {
				console.error('Error al cerrar sesión:', err);
				return res.status(500).send('Error al cerrar sesión');
			}
			res.clearCookie('connect.sid'); // Opcional: elimina la cookie de sesión
			res.redirect('/'); // Redirige al usuario al inicio o a la página de login
		});
	});
	

	// Iniciar el servidor en el puerto 3000
	const PORT = process.env.PORT || 5000;
	server.listen(PORT, () => {
		console.log(`Servidor escuchando en http://localhost:${PORT}`);
	});
