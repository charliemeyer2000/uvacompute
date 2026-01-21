package templates

import (
	_ "embed"
)

//go:embed base.yaml
var Base string

//go:embed cuda.yaml
var CUDA string
