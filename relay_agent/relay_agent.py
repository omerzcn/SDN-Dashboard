from flask import Flask, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)  # the Dashboard's browser fetch() is cross-origin; Flask doesn't allow that by default

@app.route('/relay/<agent_ip>/<agent_port>/ping/<target>')
def relay(agent_ip, agent_port, target):
    try:
        r = requests.get(f'http://{agent_ip}:{agent_port}/ping/{target}', timeout=5)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'rtt_ms': None, 'error': str(e)}), 502

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5010)
