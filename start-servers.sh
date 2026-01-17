#!/bin/bash

# Script para iniciar todos los servidores del CMS

echo "🚀 Starting CMS servers..."
echo ""

# Función para matar procesos en puertos específicos
kill_port() {
    PORT=$1
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        echo "⚠️  Killing process on port $PORT (PID: $PID)"
        kill $PID 2>/dev/null
        sleep 1
    fi
}

# Matar procesos existentes
kill_port 8000
kill_port 8002
kill_port 3000

# Iniciar backend
echo "📦 Starting backend server (port 3000)..."
cd backend
node index.js &
BACKEND_PID=$!
cd ..
sleep 2

# Iniciar admin server
echo "🔐 Starting admin server (port 8000)..."
cd admin
node server.js &
ADMIN_PID=$!
cd ..
sleep 2

# Iniciar site frontend server (cineclub)
echo "🌐 Starting site frontend server (port 8002)..."
cd ../cineclub
node server.js &
SITE_PID=$!
cd ../cms
sleep 2

echo ""
echo "✅ All servers started!"
echo ""
echo "📍 URLs:"
echo "   Backend API:  http://localhost:3000"
echo "   Admin Login:  http://localhost:8000/login.html"
echo "   Admin Panel:  http://localhost:8000/admin.html"
echo "   Site Frontend: http://localhost:8002/index.html"
echo ""
echo "⚠️  Press Ctrl+C to stop all servers"
echo ""

# Esperar a que el usuario presione Ctrl+C
trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $ADMIN_PID $SITE_PID 2>/dev/null; exit" INT

# Mantener el script corriendo
wait

