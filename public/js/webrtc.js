
	function initWebRTC() 
	{

			const socket = io();

			// <!-- const socket = io('https://localhost:3000'); -->

			const localVideo = document.getElementById('localVideo');
			const remoteVideo = document.getElementById('remoteVideo');
			const usersList = document.getElementById('users');
			const endCallButton = document.getElementById('endCall');
			const ringtone = document.getElementById('ringtone');
			const incomingCallContainer = document.getElementById('incomingCall');
			const acceptCallButton = document.getElementById('acceptCall');
			const rejectCallButton = document.getElementById('rejectCall');
			const incomingText = document.getElementById('incomingText');
			const usernameInput = document.getElementById('usernameInput');
			const roomSelect = document.getElementById('roomSelect');

			const outgoingCallContainer = document.getElementById('outgoingCall');
			const cancelCallButton = document.getElementById('cancelCallButton');
			const outgoingRingtone = document.getElementById('outgoingRingtone');
					
			let localStream;
			let peerConnection;
			let targetUserId;
			let incomingOffer;
			let inCall = false;
			let username;

			const usersState = {};

			const ringtoneOutgoing = new Audio('../outgoing-ringtone.mp3');
			
			const config = {
				iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
			};

			// Obtener el video local
			navigator.mediaDevices.getUserMedia({ video: true, audio: true })
				.then(stream => {
					localStream = stream;
					localVideo.srcObject = stream;
				})
				.catch(error => console.error('Error accediendo a la cámara:', error));


			// Función para enviar el nombre de usuario y sala al servidor
			function registerUser() 
			{
				username = usernameInput.value.trim();
				const roomName = roomSelect.value;

				if (username === '') {
					alert('Por favor, ingrese un nombre de usuario.');
					return;
				}

				// Emitir el nombre de usuario y la sala seleccionada al servidor
				socket.emit('register', { username, roomName });
			}

			document.getElementById('connectButton').addEventListener('click', registerUser);

			async function createPeerConnection() 
			{
				peerConnection = new RTCPeerConnection(config);
				localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
				peerConnection.onicecandidate = event => {
					if (event.candidate) {
						socket.emit('signal', {
							target: targetUserId,
							candidate: event.candidate
						});
					}
				};

				peerConnection.ontrack = event => {
					remoteVideo.srcObject = event.streams[0];
									outgoingRingtone.pause();
				};
			}

			socket.on('signal', async data => 
			{
				if (data.offer) {
					incomingText.textContent = `Llamada entrante de ${data.sender}`;
					incomingCallContainer.style.display = 'block';
					ringtone.play();

					incomingOffer = data.offer;
					targetUserId = data.sender;
				} else if (data.answer) {
					await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
					enableEndCall();						
					outgoingCallContainer.style.display = 'none';  //  Dejar invisible div de llamando cuando el usuario objetivo acepta la llamada -->
				} else if (data.candidate) {
					await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
				}
			});




			
			async function acceptCall() {
			// Aquí cuando el usuario objetivo acepta la llamada 
				if (incomingOffer) {
					await createPeerConnection();
					await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));
					const answer = await peerConnection.createAnswer();
					await peerConnection.setLocalDescription(answer);
					socket.emit('signal', { target: targetUserId, answer });

					incomingCallContainer.style.display = 'none';
					ringtone.pause();
					ringtone.currentTime = 0;
					enableEndCall();
					
					// Actualiza el estado a ocupado para el usuario que acepta la llamada
					inCall = true;
					updateUserState(username, true);
					socket.emit('user-busy', { userId: username, busy: true }); // Notifica al servidor que el usuario está ocupado
				}
			}

			function rejectCall() {
				incomingCallContainer.style.display = 'none';
				ringtone.pause();
				ringtone.currentTime = 0;

				// Emitir evento de rechazo de llamada al servidor
				socket.emit('call-rejected', targetUserId);

				// Restablecer el estado de llamada para ambos usuarios
				inCall = false;
				updateUserState(username, false);
				socket.emit('user-busy', { userId: username, busy: false });
			}

			function endCall() {
				if (peerConnection) {
					peerConnection.close();
					peerConnection = null;
					remoteVideo.srcObject = null;
					inCall = false;
					updateUserState(username, false);
					socket.emit('user-busy', { userId: username, busy: false });
					
					// Emitir evento para finalizar la llamada y actualizar estado de ambos usuarios
					socket.emit('end-call', { userId: username, targetUserId });	
					
					disableEndCall();
				}
			}

			socket.on('users', users => {
				usersList.innerHTML = '';
				users.forEach(user => {
					if (user !== username) {
						const firstLetter = user.charAt(0).toUpperCase();
						const li = document.createElement('li');
						li.id = `user-${user}`;

						const iconSvg = `
							<svg width="30" height="30" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 2px;">
								<circle cx="12" cy="12" r="12" fill="#007bff"></circle>
								<text x="50%" y="50%" text-anchor="middle" dy=".5em" fill="#ffffff" font-size="12" font-family="Arial">${firstLetter}</text>
							</svg>`;						
							li.innerHTML = `							
							${user} 	
							<button id="call-${user}" ${usersState[user]?.busy ? 'disabled' : ''}  class="${usersState[user]?.busy ? 'busy' : ''}"  onclick="callUser('${user}')"> ${usersState[user]?.busy ? 'Ocupado' : 'Llamar'} </button>
						`;
						usersList.appendChild(li);
					}
				});
			});
			
			



// socket.on('users', users => {
    // usersList.innerHTML = ''; // Limpiar la lista de usuarios
    // users.forEach(user => {
        // if (user !== username) {
            // const firstLetter = user.charAt(0).toUpperCase();
            // const li = document.createElement('li');
            // li.id = `user-${user}`;

            // const iconSvg = `
                // <svg width="30" height="30" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 2px;">
                    // <circle cx="12" cy="12" r="12" fill="#007bff"></circle>
                    // <text x="50%" y="50%" text-anchor="middle" dy=".5em" fill="#ffffff" font-size="12" font-family="Arial">${firstLetter}</text>
                // </svg>`;                        

            // // Crear el botón para llamar
            // const callButton = document.createElement('button');
            // callButton.id = `call-${user}`;
            // callButton.classList.add(usersState[user]?.busy ? 'busy' : '');
            // callButton.disabled = usersState[user]?.busy;
            // callButton.textContent = usersState[user]?.busy ? 'Ocupado' : 'Llamar';
            
            // // Agregar el event listener para el clic en el botón
            // callButton.addEventListener('click', function() {
                // callUser(user);  // Llamar a la función callUser cuando el botón es clickeado
            // });

            // // Insertar el botón en el li
            // li.innerHTML = `${user} ${iconSvg}`;
            // li.appendChild(callButton);

            // // Agregar el li a la lista de usuarios
            // usersList.appendChild(li);
        // }
    // });
// });





			function updateUserState(userId, isBusy) {
				const button = document.getElementById(`call-${userId}`);
				if (button) {
					button.disabled = isBusy;
					button.textContent = isBusy ? 'OCUPADO 2' : 'LLAMAR 2';
					button.classList.toggle('busy', isBusy);
				}
			}

			socket.on('user-busy', ({ userId, busy }) => {
				usersState[userId] = { busy };

				// Si es nuestro propio usuario y se rechaza la llamada, aseguramos que inCall sea falso
				if (userId === username && !busy) {
					inCall = false;
					outgoingCallContainer.style.display = 'none';
					outgoingRingtone.pause();
					outgoingRingtone.currentTime = 0;					
				}
				
				updateUserState(userId, busy);
			});

			// Evento cuando se recibe una llamada (simulación) 
			socket.on('incoming-call', (data) => {
				incomingCallContainer.style.display = 'block';
				ringtone.play();
				targetUserId = data.from;
			});


			async function callUser(userId) {
				if (inCall) return;
				targetUserId = userId;
				inCall = true;
				updateUserState(username, true);
				socket.emit('user-busy', { userId: username, busy: true });

				outgoingText.textContent = ` ${userId} ...`;
				outgoingCallContainer.style.display = 'block'; // Mostrar la UI de llamada saliente
				outgoingRingtone.play();

				await createPeerConnection();
				const offer = await peerConnection.createOffer();
				await peerConnection.setLocalDescription(offer);
				socket.emit('signal', { target: userId, offer });
			}
			

			function cancelCall() {
			// Aquí cuando el usuario que llama cancela la llamada 
				outgoingCallContainer.style.display = 'none';
				outgoingRingtone.pause();
				outgoingRingtone.currentTime = 0;

				// Notificar al servidor que la llamada ha sido cancelada
				socket.emit('cancel-call', targetUserId);

				// Restablecer el estado local
				inCall = false;
				updateUserState(username, false);
				socket.emit('user-busy', { userId: username, busy: false });
			}


			cancelCallButton.addEventListener('click', cancelCall);

			socket.on('call-canceled', () => {
				// Aquí cuando el usuario que recibe la llamada es cancelada por el usuario que llama -->
				incomingCallContainer.style.display = 'none';	
				ringtone.pause();
				ringtone.currentTime = 0;

				// Restablecer el estado local -->
				inCall = false;
				updateUserState(username, false);
				socket.emit('user-busy', { userId: username, busy: false });
			});


			function initiateCall(targetUserId) {
				if (inCall) return; // Prevenir llamadas múltiples mientras una llamada está en curso -->

				inCall = true;
				socket.emit('initiate-call', targetUserId);
				updateUserState(targetUserId, true);
			}

			function enableEndCall() {
				endCallButton.disabled = false;
				endCallButton.addEventListener('click', endCall);
			}

			function disableEndCall() {
				endCallButton.disabled = true;
				endCallButton.removeEventListener('click', endCall);
			}

			socket.emit('new-user', { id: username });

			acceptCallButton.addEventListener('click', acceptCall);
			rejectCallButton.addEventListener('click', rejectCall);


			<!-- COMIENZAN FUNCIONES DE GRABACION -->
			<!-- --------------------------------------------------------------------------------- -->
			let mediaRecorder;
			let recordedChunks = [];

			// Función para iniciar la grabación de la videollamada -->
			function startRecording() {
				// Crear un MediaRecorder y empezar a grabar el stream de video -->
				mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm; codecs=vp9' });
				mediaRecorder.ondataavailable = event => {
					if (event.data.size > 0) {
						recordedChunks.push(event.data);
					}
				};

				mediaRecorder.onstop = saveRecording;

				mediaRecorder.start();
				console.log('Grabación iniciada');
			}

			// Función para detener la grabación -->
			function stopRecording() {
				if (mediaRecorder && mediaRecorder.state !== 'inactive') {
					mediaRecorder.stop();
					console.log('Grabación detenida');
				}
			}

			// Función para guardar la grabación en una carpeta con el nombre del archivo -->
			// en el formato requerido -->
			function saveRecording() {
				const blob = new Blob(recordedChunks, { type: 'video/webm' });
				recordedChunks = []; // Limpiar los fragmentos grabados

				// Crear la carpeta y el nombre de archivo con identificación, fecha, hora y usuarios -->
				const folderName = `grabaciones`;
				const username = usernameInput.value;
				const roomName = roomSelect.value;
				const date = new Date().toISOString().slice(0, 10);
				const time = new Date().toLocaleTimeString().replace(/:/g, '-');
				const fileName = `${folderName}/${roomName}_${username}_${date}_${time}.webm`;

				// Guardar el archivo de video en la carpeta -->
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				a.download = fileName;
				a.click();
				console.log(`Grabación guardada como ${fileName}`);
			}

			// Llamar a startRecording cuando comienza la llamada -->
			document.getElementById('connectButton').addEventListener('click', startRecording);

			// Llamar a stopRecording cuando termina la llamada -->
			document.getElementById('endCall').addEventListener('click', stopRecording);




			// VISUALIZAR FECHA Y HORA LLAMADA -->
			let callStartTime;

			// Función para formatear la duración de la llamada -->
			function formatDuration(seconds) {
				const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
				const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
				return `${minutes}:${remainingSeconds}`;
			}

			// Función para iniciar la llamada y registrar el inicio -->
			function startCallTimer() {
				callStartTime = new Date();
				document.getElementById('callDate').textContent = `Fecha: ${callStartTime.toLocaleDateString()}`;
				document.getElementById('callTime').textContent = `Hora: ${callStartTime.toLocaleTimeString()}`;
				updateCallDuration();
			}

			// Función para actualizar la duración de la llamada cada segundo -->
			function updateCallDuration() {
				if (!callStartTime) return;

				const elapsedTime = Math.floor((new Date() - callStartTime) / 1000);
				document.getElementById('callDuration').textContent = `Duración: ${formatDuration(elapsedTime)}`;
				setTimeout(updateCallDuration, 1000); <!-- // Actualiza cada segundo -->
			}

			// Inicia la duración de la llamada cuando comienza la conexión -->
			document.getElementById('connectButton').addEventListener('click', startCallTimer);

			// Detener la actualización cuando se finaliza la llamada -->
			document.getElementById('endCall').addEventListener('click', () => {
				callStartTime = null; <!-- // Detiene el temporizador -->
			});


	}