

# ------------------------------------------------------------------
# Construct the complete host data
# ------------------------------------------------------------------
def GetHostData(onos_client,host_data_base):

    # Host information is currently statically defined because
    
    #Get all the data of the hosts associated with the ip address
    for host in onos_client.get_hosts():
        for host_name, value in host_data_base.items():
            if len(host.get("ipAddresses")) == 0:
                continue
            if host.get("ipAddresses")[0] == value["ipaddr"]:
                #Get the host id
                value["id"] = host.get("id")
                #Get the connections
                for device in host.get("locations"):
                    value["devs"].append({
                        "device" : device.get("elementId"),
                        "port" : device.get("port")
                    })
                break
    return host_data_base


HostData = {
    "host1" : {
        "ipaddr": "10.0.0.3",
        "devs": [],
        "id": ""
    },
    "host2" : {
        "ipaddr": "10.0.0.4",
        "devs": [],
        "id": ""
    },
    "host3" : {
        "ipaddr": "10.0.0.5",
        "devs": [],
        "id": ""
    },
    "host4" : {
        "ipaddr": "10.0.0.6",
        "devs": []#{
        #    'device': '',
        #    'port': ''
        #},
        ,"id": ""
    }
}


DeviceData = {
    "sw1": 'of:0000000000000001',
    "sw2": 'of:0000000000000002',
    "sw3": 'of:0000000000000003',
    "sw4": 'of:0000000000000004',
}



# ------------------------------------------------------------------
# Base intent templates used as blueprints for creating ONOS intents.
# Deep copies are created before modification to preserve the originals.
# ------------------------------------------------------------------

# Base Point-to-Point Intent template.
P2PIntent_base = {
    "type": "PointToPointIntent",
    "priority": 100,
    "appId": "org.onosproject.cli",  # Intent owner application
    "selector": {
        "criteria": [
            # Match IPv4 Ethernet frames only.
            { "type": "ETH_TYPE", "ethType": "0x0800" }
        ]
    },
    "treatment": {
        # No packet modifications required.
        "instructions": []
    },
    # Filled dynamically when the intent is created.
    "ingressPoint": {},
    "egressPoint": {}
}


# Base Host-to-Host Intent template.
H2HIntent_base = {
    "type": "HostToHostIntent",
    "priority": 100,
    "appId": "org.onosproject.cli",

    # Default host identifiers.
    # These are overwritten before installation.
    "one": "00:00:00:00:00:01/None",
    "two": "00:00:00:00:00:02/None",

    "selector": {
        "criteria": []
    },

    "treatment": {
        "instructions": []
    }
}


# Base Single-Point-to-Multi-Point Intent template.
S2MIntent_base = {
    "type": "SinglePointToMultiPointIntent",
    "appId": "org.onosproject.cli",
    "priority": 100,

    "selector": {
        "criteria": []
    },

    "treatment": {
        "instructions": []
    },

    # Filled dynamically.
    "ingressPoint": {},

    # List of output endpoints.
    "egressPoint": []
}


# Base Multi-Point-to-Single-Point Intent template.
M2SIntent_base = {
    "type": "MultiPointToSinglePointIntent",
    "appId": "org.onosproject.cli",
    "priority": 100,

    "selector": {
        "criteria": []
    },

    "treatment": {
        "instructions": []
    },

    # Multiple ingress endpoints.
    "ingressPoint": [],

    # Single destination endpoint.
    "egressPoint": {}
}