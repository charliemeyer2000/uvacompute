package lib

import "vm-orchestration-service/structs"

// Uses incus API to create a VM according to the request and
// forwards port 22 using tailscale funnels.
func CreateAndForwardVM(req structs.VMCreationRequest) error {
	return nil
}
