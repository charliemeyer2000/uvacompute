//go:build linux

package main

import (
	"bytes"
	"encoding/binary"
	"log"
	"time"
	"unsafe"

	"golang.org/x/sys/unix"
)

// fanotifyEventMetadata matches the kernel struct fanotify_event_metadata
type fanotifyEventMetadata struct {
	EventLen    uint32
	VersID      uint8
	Reserved    uint8
	MetadataLen uint16
	Mask        uint64
	Fd          int32
	Pid         int32
}

func (g *Guardian) startFanotify(scanCh chan<- struct{}) func() {
	fd, err := unix.FanotifyInit(unix.FAN_CLASS_NOTIF|unix.FAN_NONBLOCK, unix.O_RDONLY)
	if err != nil {
		log.Printf("WARNING: fanotify_init failed: %v — using polling only", err)
		return nil
	}

	for _, dev := range g.gpuDevices {
		err := unix.FanotifyMark(fd, unix.FAN_MARK_ADD,
			unix.FAN_OPEN|unix.FAN_CLOSE_WRITE|unix.FAN_CLOSE_NOWRITE,
			unix.AT_FDCWD, dev)
		if err != nil {
			log.Printf("WARNING: fanotify_mark %s failed: %v — skipping", dev, err)
		}
	}

	log.Println("fanotify initialized for GPU device monitoring")

	go fanotifyLoop(fd, scanCh)

	return func() {
		unix.Close(fd)
	}
}

func fanotifyLoop(fd int, scanCh chan<- struct{}) {
	buf := make([]byte, 4096)
	metaSize := int(unsafe.Sizeof(fanotifyEventMetadata{}))

	for {
		n, err := unix.Read(fd, buf)
		if err != nil {
			if err == unix.EAGAIN || err == unix.EWOULDBLOCK {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			if err == unix.EBADF {
				return
			}
			log.Printf("fanotify read error: %v", err)
			time.Sleep(time.Second)
			continue
		}

		offset := 0
		for offset+metaSize <= n {
			var meta fanotifyEventMetadata
			reader := bytes.NewReader(buf[offset : offset+metaSize])
			if err := binary.Read(reader, binary.LittleEndian, &meta); err != nil {
				break
			}
			if meta.Fd >= 0 {
				unix.Close(int(meta.Fd))
			}
			if meta.EventLen == 0 {
				break
			}
			offset += int(meta.EventLen)
		}

		triggerScan(scanCh)
	}
}
