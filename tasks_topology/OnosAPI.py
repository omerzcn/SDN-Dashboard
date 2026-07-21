import warnings
from cryptography.utils import CryptographyDeprecationWarning
warnings.filterwarnings("ignore", category=CryptographyDeprecationWarning)


import requests
from requests.auth import HTTPBasicAuth
import json
import subprocess
import docker
import re
from urllib.parse import quote

#A list of the typical onos application and their titles
onos_apps = [
    ("Default Drivers","org.onosproject.drivers"),
("Host Location Provider","org.onosproject.hostprovider"),
("LLDP Link Provider","org.onosproject.lldpprovider"),
("ONOS GUI2","org.onosproject.gui2"),
("Reactive Forwarding","org.onosproject.fwd"),
("Access Control Lists","org.onosproject.acl"),
("Arista Drivers","org.onosproject.drivers.arista"),
("Artemis","org.onosproject.artemis"),
("BGP Router","org.onosproject.bgprouter"),
("BMv2 Drivers","org.onosproject.drivers.bmv2"),
("Barefoot Drivers","org.onosproject.drivers.barefoot"),
("Basic Optical Drivers","org.onosproject.drivers.optical"),
("Basic Pipelines","org.onosproject.pipelines.basic"),
("CORD Support","org.onosproject.cord-support"),
("Castor","org.onosproject.castor"),
("Ciena 5162 Drivers","org.onosproject.drivers.ciena.c5162"),
("Ciena 5170 Drivers","org.onosproject.drivers.ciena.c5170"),
("Ciena Waveserver Ai Drivers","org.onosproject.drivers.ciena.waveserverai"),
("Ciena Waveserver Ai YANG Models","org.onosproject.models.ciena.waveserverai"),
("Ciena Waveserver Drivers","org.onosproject.drivers.ciena.waveserver"),
("Cisco NETCONF Drivers","org.onosproject.drivers.cisco.netconf"),
("Cisco REST Drivers","org.onosproject.drivers.cisco.rest"),
("Cluster HA Test","org.onosproject.cluster-ha"),
("Common YANG Models","org.onosproject.models.common"),
("Control Message Stats Provider","org.onosproject.openflow-message"),
("Control Plane Manager","org.onosproject.cpman"),
("Control Plane Redirect","org.onosproject.cpr"),
("Controller Monitor Application","org.onosproject.nodemetrics"),
("Controller node diagnosis Application","org.onosproject.node-diagnosis"),
("Corsa Drivers","org.onosproject.drivers.corsa"),
("CzechLight Drivers","org.onosproject.drivers.czechlight"),
("DHCP Relay Agent","org.onosproject.dhcprelay"),
("DHCP Server","org.onosproject.dhcp"),
("Distributed Load Test","org.onosproject.loadtest"),
("Distributed Primitives Test","org.onosproject.distributedprimitives"),
("Driver Support Matrix","org.onosproject.drivermatrix"),
("Dynamic Configuration","org.onosproject.config"),
("Event History","org.onosproject.events"),
("FIB Installer","org.onosproject.fibinstaller"),
('FIB Push Manager ("FPM"), Route Receiver',"org.onosproject.fpm"),
("Fabric Pipeline","org.onosproject.pipelines.fabric"),
("Fault Management","org.onosproject.faultmanagement"),
("Flow Performance Test","org.onosproject.flow-perf"),
("Flow Space Analysis","org.onosproject.flowanalyzer"),
("Flow Throughput Demo","org.onosproject.demo"),
("Flowspec API","org.onosproject.flowspec-api"),
("Fujitsu Drivers","org.onosproject.drivers.fujitsu"),
("Ganglia Report and Query","org.onosproject.gangliametrics"),
("General Device Provider","org.onosproject.generaldeviceprovider"),
("Generic Flow Spec Drivers","org.onosproject.drivers.flowspec"),
("Generic LISP Drivers","org.onosproject.drivers.lisp"),
("Generic NETCONF Drivers","org.onosproject.drivers.netconf"),
("Generic OVSDB Drivers","org.onosproject.drivers.ovsdb"),
("Graphite Report and Query","org.onosproject.graphitemetrics"),
("HP Drivers","org.onosproject.drivers.hp"),
("Host Mobility","org.onosproject.mobility"),
("Host Probing Provider","org.onosproject.hostprobingprovider"),
("IETF YANG Models","org.onosproject.models.ietf"),
("IPv6 RA Generator","org.onosproject.routeradvertisement"),
("InfluxDB Report and Query","org.onosproject.influxdbmetrics"),
("Intent Monitoring and Rerouting","org.onosproject.imr"),
("Intent Performance Test","org.onosproject.intentperf"),
("Intent Synchronizer","org.onosproject.intentsynchronizer"),
("Juniper Drivers","org.onosproject.drivers.juniper"),
("Kafka Integration","org.onosproject.kafka-integration"),
("KubeVirt Networking Application","org.onosproject.kubevirt-networking"),
("KubeVirt Node Application","org.onosproject.kubevirt-node"),
("Kubernetes Networking Application","org.onosproject.k8s-networking"),
("Kubernetes Node Application","org.onosproject.k8s-node"),
("LISP Provider","org.onosproject.lisp"),
("Layer 2 Monitoring CFM Application","org.onosproject.cfm"),
("Link Discovery Provider","org.onosproject.linkdiscovery"),
("Link Properties","org.onosproject.linkprops"),
("Lumentum Drivers","org.onosproject.drivers.lumentum"),
("Mapping Management","org.onosproject.mappingmanagement"),
("Master Election Test","org.onosproject.election"),
("Mastership Load Balancer","org.onosproject.mlb"),
("Mellanox Drivers","org.onosproject.drivers.mellanox"),
("Messaging Performance Test","org.onosproject.messaging-perf"),
("Multicast Forwarding","org.onosproject.mfwd"),
("Multicast traffic control","org.onosproject.mcast"),
("MyTunnel Demo App","org.onosproject.p4tutorial.mytunnel"),
("NETCONF Provider","org.onosproject.netconf"),
("Network Config Host Provider","org.onosproject.netcfghostprovider"),
("Network Config Link Provider","org.onosproject.netcfglinksprovider"),
("Network Configuration Monitor Test","org.onosproject.netcfg-monitor"),
("Network Troubleshooter","org.onosproject.network-troubleshoot"),
("Null Provider Suite","org.onosproject.null"),
("ODTN API & Utilities Application","org.onosproject.odtn-api"),
("ODTN Driver","org.onosproject.drivers.odtn-driver"),
("ODTN Service Application","org.onosproject.odtn-service"),
("ONF Transport API YANG Models","org.onosproject.models.tapi"),
("ONLP device demo","org.onosproject.onlp-demo"),
("ONOS Legacy GUI","org.onosproject.gui"),
("OVSDB Provider","org.onosproject.ovsdb-base"),
("OVSDB Southbound Meta","org.onosproject.ovsdb"),
("OVSDB host Provider","org.onosproject.ovsdbhostprovider"),
("Open ROADM","org.onosproject.openroadm"),
("Open ROADM YANG Models","org.onosproject.models.openroadm"),
("OpenConfig Infinera XT3300 YANG Models","org.onosproject.models.openconfig-infinera"),
("OpenConfig RD v0.3 YANG Models","org.onosproject.models.openconfig-odtn"),
("OpenConfig YANG Models","org.onosproject.models.openconfig"),
("OpenFlow Agent","org.onosproject.ofagent"),
("OpenFlow Base Provider","org.onosproject.openflow-base"),
("OpenFlow Provider Suite","org.onosproject.openflow"),
("OpenStack Networking Application","org.onosproject.openstacknetworking"),
("OpenStack Node Bootstrap","org.onosproject.openstacknode"),
("OpenStack Telemetry Application","org.onosproject.openstacktelemetry"),
("OpenStack Troubleshoot","org.onosproject.openstacktroubleshoot"),
("Openflow overlay","org.onosproject.workflow.ofoverlay"),
("Openstack Networking UI","org.onosproject.openstacknetworkingui"),
("Openstack Vtap Application","org.onosproject.openstackvtap"),
("Oplink Drivers","org.onosproject.drivers.oplink"),
("Optical Application","org.onosproject.roadm"),
("Optical Network Model","org.onosproject.optical-model"),
("Optical Network Model REST API","org.onosproject.optical-rest"),
("P4 In-band Network Telemetry Service","org.onosproject.inbandtelemetry"),
("P4 Tutorial Pipeconf","org.onosproject.p4tutorial.pipeconf"),
("P4Runtime Drivers","org.onosproject.drivers.p4runtime"),
("P4Runtime Protocol Subsystem","org.onosproject.protocols.p4runtime"),
("P4Runtime Provider","org.onosproject.p4runtime"),
("Packet Statistics","org.onosproject.packet-stats"),
("Packet Throttler","org.onosproject.packetthrottle"),
("Packet/Optical Use-Case","org.onosproject.newoptical"),
("Path Visualization","org.onosproject.pathpainter"),
("Polatis Device Drivers","org.onosproject.drivers.polatis.netconf"),
("Polatis OpenFlow Device Drivers","org.onosproject.drivers.polatis.openflow"),
("Polatis YANG Model","org.onosproject.models.polatis"),
("Port Load Balance Service","org.onosproject.portloadbalancer"),
("Power Management","org.onosproject.powermanagement"),
("Primitive Performance Test","org.onosproject.primitiveperf"),
("Protocol Independent Multicast Emulation","org.onosproject.pim"),
("Proxy ARP/NDP","org.onosproject.proxyarp"),
("REST Provider","org.onosproject.restsb"),
("RESTCONF Application Module","org.onosproject.restconf"),
("RESTCONF Server Module","org.onosproject.protocols.restconfserver"),
("Rabbit MQ Integration","org.onosproject.rabbitmq"),
("Route Service Server","org.onosproject.route-service"),
("Route and Flow Scalability Test","org.onosproject.routescale"),
("SDN-IP","org.onosproject.sdnip"),
("SDN-IP Reactive Routing","org.onosproject.reactive-routing"),
("SNMP Provider","org.onosproject.snmp"),
("SONA SimpleFabric","org.onosproject.simplefabric"),
("Scalable Gateway","org.onosproject.scalablegateway"),
("Server Device Drivers","org.onosproject.drivers.server"),
("Stratum Drivers","org.onosproject.drivers.stratum"),
("Stratum Odtn Drivers","org.onosproject.drivers.stratum-odtn"),
("TL1 Provider","org.onosproject.tl1"),
("Topology & Intent Metrics","org.onosproject.metrics"),
("Transaction Performance Test","org.onosproject.transaction-perf"),
("Tunnel Subsystem","org.onosproject.tunnel"),
("UI Auto-Layout","org.onosproject.layout"),
("VLAN L2 Broadcast Network","org.onosproject.vpls"),
("Virtual Broadband Gateway","org.onosproject.virtualbng"),
("Virtual Network Subsystem","org.onosproject.virtual"),
("Virtual Router","org.onosproject.vrouter"),
("Workflow","org.onosproject.workflow"),
("XMPP Core Protocol Subsystem","org.onosproject.protocols.xmpp"),
("XMPP Device Provider","org.onosproject.xmpp.device"),
("XMPP Publish/Subscribe protocol extension subsystem","org.onosproject.protocols.xmpp.pubsub"),
("YANG Compiler and Runtime","org.onosproject.yang"),
("YANG Runtime GUI","org.onosproject.yang-gui"),
("ZTE Drivers","org.onosproject.drivers.zte"),
("gNMI Drivers","org.onosproject.drivers.gnmi"),
("gNMI Protocol Subsystem","org.onosproject.protocols.gnmi"),
("gNOI Drivers","org.onosproject.drivers.gnoi"),
("gNOI Protocol Subsystem","org.onosproject.protocols.gnoi"),
("gRPC Protocol Subsystem","org.onosproject.protocols.grpc"),
("µONOS Integration","org.onosproject.onos-topo"),
]




def run(cmd, no_output=False, return_output=False):
    """
    Execute a shell command and return its output.
    """
    if no_output:
        # Runs command silently, returns nothing
        subprocess.run(cmd, shell=True, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return None
    
    if return_output:
        # Captures stdout and stderr, returns as a string
        result = subprocess.run(cmd, shell=True, check=False, capture_output=True, text=True)
        return result.stdout.strip()
    else:
        # Just runs the command to the console (standard behavior)
        subprocess.run(cmd, shell=True, check=False)
        return None


class OnosAPI:
    def __init__(self):
        self.session = requests.Session()

    def _onos_server_reachable(self):
        """
        Checks if the ONOS API port is open and accepting connections.
        """
        cmd = f"curl -s -o /dev/null -w '%{{http_code}}' {self.base_url}"
        # This will return '200' if reachable, '000' or '404' otherwise
        status = run(cmd, return_output=True)
        return status == "200"

    def _onos_server_accesible(self):
        """
        Checks if the ONOS API port is open and accepting connections.
        """
        #Send a get request to the main address. We don't care about content, only if authentication works
        resp = self.session.get(f"{self.base_url}")
        
        #We do not care about anything except if not authenticated. Other error codes should have
        #been detected before
        return resp.status_code != 401


    #Function to get the ip from the docker containers
    @staticmethod
    def _get_ip_from_docker():
        # Get first attached network IP from the docker onos network
        ip_add = next(iter(docker.from_env().containers.get("onos").attrs['NetworkSettings']['Networks'].values()))['IPAddress']

        return ip_add

    def _get_auth(self):
        """
        Function invoked if current authentication is not working
        """
        print(f"Incorrect credentials, enter other")
        for i in range(3):
            user = input("Username: ")
            password = input("Password: ")
            self.session.auth = (user, password)
            if self._onos_server_accesible():
                return True
        return False
            

    def login(self, host_ip_addr=None, port=8181, user='onos', password='rocks'):
        #Check the IP Address
        if host_ip_addr == None:
            host_ip_addr = OnosAPI._get_ip_from_docker()

        #Set the most basic url, could be useful for some requests.
        self.base_base_url = f"http://{host_ip_addr}:{port}"
        #Set the standard ONOS REST API base url.
        self.base_url = f"{self.base_base_url}/onos/v1"
        if not self._onos_server_reachable:
            print(f"Server is not reachable at {self.base_url}")
            return False
        
        #Authenticate the user
        self.session.auth = (user, password)
        if not self._onos_server_accesible():
            return self._get_auth()
        
        return True

    def _exec_std(self):
        resp = self.session.send(self.session.prepare_request(self.curr_request))

        if resp.status_code == 401 or resp.status_code == 403:
            #Credentials are wrong, retry
            if not self._get_auth():
                return None
            return self._exec_std()
        elif resp.status_code >= 400 and resp.status_code < 500:
            #Error Code, print the result.
            print(f"Error Code: {resp.status_code}")
            print(resp.content)
            return None
        elif resp.status_code >= 200 and resp.status_code < 300:
            try:
                # Attempt to decode the response as JSON
                data = resp.json()
        
            except:
                # Fall back to raw text if JSON decoding fails
                data = resp.content
            if not data:
                return resp.status_code
            return data
            


    @staticmethod
    def _get_act_apps(file_path):
        results = []
        # Regex explained: " looks for a quote, (.*?) captures everything inside lazily
        pattern = r'Activate "(.*?)"'
        
        with open(file_path, 'r') as f:
            for line in f:
                # findall returns a list of everything inside quotes on that line
                matches = re.findall(pattern, line)
                results.extend(matches)    
        return results



    def activate_apps(self, file_path="application_list.txt"):
        print("Activating Applications")
        #Get all to be activated titles
        titles = OnosAPI._get_act_apps(file_path)

        for title in titles:
            #Find the corresponding ID of the title
            result = next((item for item in onos_apps if item[0] == title), None)
            if not result:
                print(f"Could not find {title}")
            else:
                #Activate the title
                print(f"Activating {title} as {result[1]}")
                self.curr_request = requests.Request('POST', f"{self.base_url}/applications/{result[1]}/active")
                if not self._exec_std():
                    print(f"Could not activate {title} as {result[1]}")


    def test_if_apps_activated(self, file_path="application_list.txt"):
        """Verify that ONOS applications listed in a file are ACTIVE."""

        # Extract application titles marked for activation.
        titles = OnosAPI._get_act_apps(file_path)

        # Assume all applications are active until proven otherwise.
        are_activated = True

        for title in titles:

            # Map human-readable title to ONOS application ID.
            result = next((item for item in onos_apps if item[0] == title), None)

            # Skip unknown applications.
            if not result:
                continue

            # Query ONOS for application state.
            self.curr_request = requests.Request(
                'GET',
                f"{self.base_url}/applications/{result[1]}"
            )

            data = self._exec_std()

            # Handle missing application response.
            if not data:
                print(f"Error: Application not found: {title}")
                are_activated = False

            else:
                state = data.get("state")

                # Handle missing state field.
                if not state:
                    print(f"Error: No state object (how?) for {title}")
                    are_activated = False

                # Confirm application is active.
                elif state == 'ACTIVE':
                    print(f"{title} : {result[1]} \t\t ACTIVE")

                # Application exists but is not active.
                else:
                    print(f"Error: {title} : {result[1]} \t\t NOT ACTIVE")
                    are_activated = False

        return are_activated






    def get_devices(self):
        """Retrieve all devices known to ONOS."""
        self.curr_request = requests.Request(
            'GET',
            f"{self.base_url}/devices"
        )
        return self._exec_std().get("devices")


    def get_device_data(self, device_id):
        """Retrieve port-level information for a specific device."""
        self.curr_request = requests.Request(
            'GET',
            f"{self.base_url}/devices/{device_id}/ports"
        )
        return self._exec_std()


    def get_hosts(self):
        """Retrieve all hosts discovered by ONOS."""
        self.curr_request = requests.Request(
            'GET',
            f"{self.base_url}/hosts"
        )
        return self._exec_std().get("hosts")


    def get_links(self):
        """Retrieve all network links discovered by ONOS."""
        self.curr_request = requests.Request(
            'GET',
            f"{self.base_url}/links"
        )
        return self._exec_std().get("links")


    def get_intents(self):
        """Retrieve all installed intents."""
        self.curr_request = requests.Request(
            'GET',
            f"{self.base_url}/intents"
        )
        return self._exec_std().get("intents")


    def post_intent(self, intent):
        """Install a new intent into ONOS."""
        self.curr_request = requests.Request(
            'POST',
            f"{self.base_url}/intents",
            json=intent
        )
        return self._exec_std()


    def remove_intent(self, appId, intentId):
        """Remove an intent using its application and intent ID."""
        self.curr_request = requests.Request(
            'DELETE',
            f"{self.base_url}/intents/{appId}/{intentId}"
        )
        return self._exec_std()


    def get_flows(self):
        """Retrieve all flow entries from ONOS."""
        self.curr_request = requests.Request(
            'GET',
            f"{self.base_url}/flows/"
        )
        return self._exec_std().get("flows")


    def get_device_flows(self, device_id):
        """Retrieve flow entries for a specific device."""
        self.curr_request = requests.Request(
            'GET',
            f"{self.base_url}/flows/{device_id}"
        )
        return self._exec_std().get("flows")


    def post_flow(self, device_id, flow_entry):
        """Install a flow entry on a device."""
        self.curr_request = requests.Request(
            'POST',
            f"{self.base_url}/flows/{device_id}",
            data=flow_entry
        )
        return self._exec_std()


    def remove_flow(self, device_id, flow_id):
        """Remove a flow entry from a device."""
        self.curr_request = requests.Request(
            'DELETE',
            f"{self.base_url}/flows/{device_id}/{flow_id}"
        )
        return self._exec_std()


    def get_path(self, elemId1, elemId2):
        """Compute network path between two elements."""
        self.curr_request = requests.Request(
            'GET',
            f"{self.base_url}/paths/{quote(elemId1, safe='')}/{quote(elemId2, safe='')}"
        )
        return self._exec_std().get("paths")


    
    ## Utility classes
    def print_devices(self, bData = True, bPorts = True):
        print("DEVICES:")
        devices_id = []
        for device in self.get_devices():
            devices_id.append(device.get("id"))

        devices_id = sorted(devices_id)
        if not bData and not bPorts:
            for device in devices_id:
                print(f'{device}')
        else:
            for device in devices_id:
                device_data = self.get_device_data(device)
                print(f'{device}:')
                if bData:
                    print(f'\tManIP: {device_data.get("annotations").get("managementAddress")} -> OF : {device_data.get("annotations").get("protocol")}')
                if bPorts:
                    print("\tPorts:")
                    for port in device_data.get("ports"):
                        if port.get("isEnabled"):
                            print(f'\t\t {port.get("port")}: {port.get("annotations").get("portMac")} -> {port.get("annotations").get("portName")}')

    def print_device_data(self, device_id):
        if device_id:
            device_data = self.get_device_data(device_id)
            if device_data:
                print(f'{device_id}: ManIP: {device_data.get("annotations").get("managementAddress")} -> OF : {device_data.get("annotations").get("protocol")}')
            else:
                print(f"No Device with ID {device_id} found")

    def print_device_ports(self, device_id):
        if device_id:
            device_data = self.get_device_data(device_id)
            if device_data:
                print(f"{device_id}: Ports:")
                for port in device_data.get("ports"):
                    if port.get("isEnabled"):
                        print(f'\t {port.get("port")}: {port.get("annotations").get("portMac")} -> {port.get("annotations").get("portName")}')
            else:
                print(f"No Device with ID {device_id} found")
    
    def print_hosts(self):
        print("HOSTS:")
        for host in self.get_hosts():
            #Only get the first IP Address of each host
            print(f'ID: {host.get("id")} \tMAC: {host.get("mac")} \tIP: {host.get("ipAddresses")[0]}')


    def print_host_data(self, host_ip_addr):
        found_ip = False
        for host in self.get_hosts():
            if host.get("ipAddresses")[0] == host_ip_addr:
                found_ip = True
                print(f'ID: {host.get("id")} \tIP: {host.get("ipAddresses")[0]} \tPort: {host.get("locations")[0].get("port")}')
        if not found_ip:
            print(f"Ip Address {host_ip_addr} not found")

    def remove_host_inv(self, host_ip_addr):
        found_ip = False
        for host in self.get_hosts():
            if host.get("ipAddresses")[0] == host_ip_addr:
                found_ip = True
                self.remove_host(host.get("id"))
                print(f'Removed Host {host.get("id")}')
                
        if not found_ip:
            print(f"Ip Address {host_ip_addr} not found")



    def print_links(self):
        print("LINKS:")
        for link in self.get_links():
            if link.get("state") == "ACTIVE":
                print(f'Src: {link.get("src").get("device")} P:{link.get("src").get("port")} -> Dst: {link.get("dst").get("device")} P:{link.get("dst").get("port")}')


    def print_flow(self, flow, raw=False):
        if raw:
            print(f"\t{flow}")
        else:
            print(f'\tFlowID: {flow.get("id")} \tAppID: {flow.get("appId")} \tDevID: {flow.get("deviceId")} \t Instr: {flow.get("treatment").get("instructions")}')
            print(f'\tSelec: {flow.get("selector").get("criteria")}')

    def print_device_flows(self, device_id, raw=False):
        flows = self.get_device_flows(device_id)
        if flows:
            for flow in flows:
                self.print_flow(flow,raw)
        else:
            print(f"Device not found {device_id}")

    def print_flows(self, raw=False):
        devices_id = []
        for device in self.get_devices():
            devices_id.append(device.get("id"))

        devices_id = sorted(devices_id)
        for device_id in devices_id:
            print(f"Device:  {device_id}")
            self.print_device_flows(device_id, raw)

    def print_flows_by_app(self, raw=False):
        flows = self.get_flows()

        flows = sorted(flows, key= lambda x : x["appId"])
        
        prev_id = ""
        for flow in flows:
            if prev_id != flow["appId"]:
                prev_id = flow["appId"]
                print(f"AppID:  {prev_id}")
            self.print_flow(flow, raw)


    def print_intents(self):
        print("INTENTS:")
        intents = self.get_intents()
        for intent in intents:
            print(intent)







