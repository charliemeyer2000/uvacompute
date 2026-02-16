//go:build !linux

package main

import "log"

func (g *Guardian) startFanotify(scanCh chan<- struct{}) func() {
	log.Println("fanotify not available on this platform — using polling only")
	return nil
}
