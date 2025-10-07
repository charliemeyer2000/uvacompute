package structs

import (
	"github.com/goccy/go-yaml"
)

type IncusVMInfo struct {
	Name         string `yaml:"Name"`
	Description  string `yaml:"Description"`
	Status       string `yaml:"Status"`
	Type         string `yaml:"Type"`
	Architecture string `yaml:"Architecture"`
	Created      string `yaml:"Created"`
	LastUsed     string `yaml:"Last Used"`

	Location        string          `yaml:"Location,omitempty"`         // Only in clustered environments
	PID             int             `yaml:"PID,omitempty"`              // Only when running
	Started         string          `yaml:"Started,omitempty"`          // Only when running
	OperatingSystem *IncusOSInfo    `yaml:"Operating System,omitempty"` // Only when running with OS info
	Resources       *IncusResources `yaml:"Resources,omitempty"`
}

type IncusOSInfo struct {
	OS            string `yaml:"OS"`
	OSVersion     string `yaml:"OS Version"`
	KernelVersion string `yaml:"Kernel Version"`
	Hostname      string `yaml:"Hostname"`
	FQDN          string `yaml:"FQDN"`
}

type IncusResources struct {
	Processes    int                            `yaml:"Processes,omitempty"`
	DiskUsage    map[string]string              `yaml:"Disk usage,omitempty"`
	CPUUsage     *IncusCPUUsage                 `yaml:"CPU usage,omitempty"`
	MemoryUsage  *IncusMemoryUsage              `yaml:"Memory usage,omitempty"`
	NetworkUsage map[string]*IncusNetworkDevice `yaml:"Network usage,omitempty"`
}

type IncusCPUUsage struct {
	CPUUsageSeconds int `yaml:"CPU usage (in seconds)"`
}

type IncusMemoryUsage struct {
	MemoryCurrent string `yaml:"Memory (current),omitempty"`
	MemoryPeak    string `yaml:"Memory (peak),omitempty"`
	SwapCurrent   string `yaml:"Swap (current),omitempty"`
	SwapPeak      string `yaml:"Swap (peak),omitempty"`
}

type IncusNetworkDevice struct {
	Type                   string        `yaml:"Type"`
	State                  string        `yaml:"State"`
	HostInterface          string        `yaml:"Host interface,omitempty"`
	MACAddress             string        `yaml:"MAC address,omitempty"`
	MTU                    int           `yaml:"MTU,omitempty"`
	BytesReceived          string        `yaml:"Bytes received,omitempty"`
	BytesSent              string        `yaml:"Bytes sent,omitempty"`
	PacketsReceived        int           `yaml:"Packets received,omitempty"`
	PacketsSent            int           `yaml:"Packets sent,omitempty"`
	ErrorsReceived         int           `yaml:"Errors received,omitempty"`
	ErrorsSent             int           `yaml:"Errors sent,omitempty"`
	PacketsDroppedInbound  int           `yaml:"Packets dropped inbound,omitempty"`
	PacketsDroppedOutbound int           `yaml:"Packets dropped outbound,omitempty"`
	IPAddresses            yaml.MapSlice `yaml:"IP addresses,omitempty"`
}

func ParseIncusInfo(yamlData []byte) (*IncusVMInfo, error) {
	var info IncusVMInfo
	err := yaml.UnmarshalWithOptions(yamlData, &info, yaml.AllowDuplicateMapKey())
	if err != nil {
		return nil, err
	}
	return &info, nil
}
