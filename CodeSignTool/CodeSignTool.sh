#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${CODE_SIGN_TOOL_PATH}" ]]; then
 java -jar "${SCRIPT_DIR}/jar/code_sign_tool-1.3.2.jar" "$@"
else
 java -jar "${CODE_SIGN_TOOL_PATH}/jar/code_sign_tool-1.3.2.jar" "$@"
fi