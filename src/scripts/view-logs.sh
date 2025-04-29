#!/bin/bash

LOGS_DIR="$(dirname "$(dirname "$(dirname "$0")")")/logs"
DEFAULT_LINES=50

# Default values
LINES=$DEFAULT_LINES
FOLLOW=false
GREP_PATTERN=""
LOG_FILE="*"

# Function to display help
show_help() {
    echo "Usage: view-logs.sh [OPTIONS]"
    echo "View and filter log files from the logs directory"
    echo
    echo "Options:"
    echo "  -h, --help             Show this help message and exit"
    echo "  -f, --follow           Follow the log file (like tail -f)"
    echo "  -n, --lines NUMBER     Show the last NUMBER lines (default: $DEFAULT_LINES)"
    echo "  -g, --grep PATTERN     Filter logs with grep using PATTERN"
    echo "  -l, --log COMPONENT    Specify a specific component's logs to view (case insensitive, partial match)"
    echo
    echo "Examples:"
    echo "  ./view-logs.sh -f                      # Follow all logs"
    echo "  ./view-logs.sh -n 100                  # Show last 100 lines of all logs"
    echo "  ./view-logs.sh -g ERROR                # Show only lines containing ERROR"
    echo "  ./view-logs.sh -l inngest -f -g chat   # Follow inngest log files and filter for 'chat'"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -n|--lines)
            LINES="$2"
            shift 2
            ;;
        -g|--grep)
            GREP_PATTERN="$2"
            shift 2
            ;;
        -l|--log)
            # Make it case insensitive
            COMPONENT=$(echo "$2" | tr '[:upper:]' '[:lower:]')
            LOG_FILE="*${COMPONENT}*"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Check if logs directory exists
if [ ! -d "$LOGS_DIR" ]; then
    echo "Error: Logs directory not found: $LOGS_DIR"
    exit 1
fi

# List log files that match the pattern
matching_files=$(find "$LOGS_DIR" -type f -name "$LOG_FILE" | sort)

if [ -z "$matching_files" ]; then
    echo "No log files found matching: $LOG_FILE"
    echo "Available log files:"
    find "$LOGS_DIR" -type f | sort
    exit 1
fi

# Create a comma-separated list for the tail command
file_list=""
for file in $matching_files; do
    if [ -z "$file_list" ]; then
        file_list="$file"
    else
        file_list="$file_list $file"
    fi
done

# Construct the command
if [ "$FOLLOW" = true ]; then
    CMD="tail -f"
else
    CMD="tail -n $LINES"
fi

# Add the matching files
CMD="$CMD $file_list"

# Add grep if pattern is provided
if [ -n "$GREP_PATTERN" ]; then
    CMD="$CMD | grep --color=auto \"$GREP_PATTERN\""
else
    # If no grep pattern, we'll use grep to add colors to log levels
    CMD="$CMD | grep --color=auto -E '^|ERROR|WARN|INFO|DEBUG'"
fi

# Execute the command
echo "Executing: $CMD"
eval "$CMD" 