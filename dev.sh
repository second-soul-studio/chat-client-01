#!/bin/bash

# Color codes for output
BACKEND_COLOR='\033[94m'    # Blue
FRONTEND_COLOR='\033[92m'   # Green
RESET_COLOR='\033[0m'

# Store PIDs
BACKEND_PID=""
FRONTEND_PID=""

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Stopping both services..."
    
    if [ ! -z "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null
        echo "   Backend stopped"
    fi
    
    if [ ! -z "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null
        echo "   Frontend stopped"
    fi
    
    exit 0
}

# Set up trap to catch Ctrl+C
trap cleanup SIGINT SIGTERM

# Start backend with prefix
(
    cd backend
    while true; do
        echo -e "${BACKEND_COLOR}[backend]${RESET_COLOR}" >&1
        bash start.sh 2>&1 | sed "s/^/${BACKEND_COLOR}[backend]${RESET_COLOR} /"
        sleep 1
    done
) &
BACKEND_PID=$!

# Start frontend with prefix
(
    cd frontend
    while true; do
        echo -e "${FRONTEND_COLOR}[frontend]${RESET_COLOR}" >&1
        bash start.sh 2>&1 | sed "s/^/${FRONTEND_COLOR}[frontend]${RESET_COLOR} /"
        sleep 1
    done
) &
FRONTEND_PID=$!

echo -e "${BACKEND_COLOR}[backend]${RESET_COLOR}  Starting on port 9080..."
echo -e "${FRONTEND_COLOR}[frontend]${RESET_COLOR} Starting dev server..."
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Wait for both processes
wait
