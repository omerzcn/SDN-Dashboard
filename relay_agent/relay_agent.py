from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)  # the Dashboard's/laptop's request is cross-origin; Flask doesn't allow that by default

# Forwards any method/path/body to a given agent host:port.
# Covers /ping, /health, /start, /stop, /result, or anything else an agent adds later.
@app.route('/relay/<agent_ip>/<agent_port>/<path:subpath>', methods=['GET', 'POST'])
def relay(agent_ip, agent_port, subpath):
    url = f'http://{agent_ip}:{agent_port}/{subpath}'
    try:
        if request.method == 'POST':
            r = requests.post(url, json=request.get_json(silent=True), timeout=10)
        else:
            r = requests.get(url, timeout=10)
        return jsonify(r.json()), r.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 502

if __name__ == '__main__':
    # without threaded=True, flask's server handles one request at a time and not responding
    app.run(host='0.0.0.0', port=5010, threaded=True)
