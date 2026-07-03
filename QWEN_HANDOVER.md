# Qwen 개발자를 위한 DAW 기능 구현 및 빌드 정상화 인계 문서 (Developer Handover Document)

본 문서는 Qwen이 분석한 `DAW_ANALYSIS_PROMPT.md` 문서의 요구사항을 바탕으로 진행된 기능 구현 및 빌드 오류 수정 내역을 기술적으로 상세히 설명하여, Qwen이 후속 소스코드 고도화 작업을 원활하게 이어갈 수 있도록 돕기 위해 작성되었습니다.

구현된 모든 코드는 `main` 브랜치에 커밋 및 푸시가 완료되었습니다. (`npm run build` 정상 통과 상태)

---

## 1. 프로젝트 주요 아키텍처 및 아티팩트 변경 사항

### A. 데이터 모델 및 오디오 엔진 고도화 (`src/audio/AudioEngine.ts`)
- **`Track` 인터페이스 확장**:
  - `groupId?: string`, `isFolder?: boolean`, `collapsed?: boolean`: Logic Pro 스타일의 Track Stacks(그룹화 및 폴더 접기/펴기) 데이터를 저장하기 위한 필드를 추가했습니다.
  - `noteVelocities?: { [step: number]: { [pitch: string]: number } }`: 각 MIDI 노트의 세부 벨로시티(1~127) 정보를 단계별, 음정별로 매핑하여 저장하는 데이터 구조를 구현했습니다.
  - `pedalBypass`, `pedalRelease`, `pedalDamping`, `pedalResonance`: 기존에 유실되었던 건반 페달 관련 파라미터들을 인터페이스에 복구하고 기본값을 주입했습니다.
- **프로젝트 백업/복원 엔진 구현**:
  - `exportProjectJson(): string`: 현재 프로젝트의 BPM, 루프 구간, 전체 스텝 수, 그리고 바이너리 버퍼를 제외한 모든 트랙의 시퀀스 및 이펙트 설정 데이터를 JSON String으로 변환합니다.
  - `importProjectJson(jsonStr: string): boolean`: 업로드된 JSON 백업 데이터를 파싱하여 오디오 엔진 상태를 복원하고, Web Audio API의 각 트랙별 이펙터 노드 그래프(`setupTrackNodes`)를 재생성합니다.
- **스케일 가이드 함수**:
  - `NOTE_NAMES` 배열 및 `SCALE_DEFINITIONS` 스케일 반음 정보 테이블(Major, Minor, Pentatonic, Dorian, Blues 등)을 `export`하여 UI 컴포넌트에서 건반 강조에 활용할 수 있도록 했습니다.
  - `isNoteInScale(pitch, root, scale)` 헬퍼 함수를 통해 특정 음정이 선택된 스케일에 부합하는지 여부를 실시간 판별합니다.

### B. 피아노 롤 & MIDI 에디터 고도화 (`src/components/PianoRoll.tsx`)
- **Velocity Lane Editor (벨로시티 에디터)**:
  - 피아노 롤 하단에 각 스텝별 노트의 벨로시티 크기를 시각화하는 인터랙티브 캔버스를 추가했습니다.
  - 사용자가 마우스로 각 스텝의 벨로시티 바를 클릭 및 드래그하면 `1`부터 `127` 사이의 값으로 실시간 조정되며, 조정된 값은 노트의 색상 불투명도(Opacity)에 즉각 반영됩니다.
- **Scale Assistant & Key Highlight**:
  - Root Key(C~B)와 Scale Type을 선택할 수 있는 드롭다운 메뉴를 배치했습니다.
  - 선택된 스케일에 포함된 건반(Piano Key) 왼쪽에 **하늘색(#00f2fe) 테두리 선**을 긋고 내부에 그림자 효과를 주어 스케일 음을 강조합니다.
  - 스텝 셀 그리드 배경 역시 스케일 내의 음정인 경우 반투명한 하늘색 배경을 적용하여 시각적 작곡 가이드를 완성했습니다.
- **Chord Generator Helper**:
  - 사용자가 지정한 Root Key를 기준으로 Major triad, Minor triad 등의 3성/4성 코드를 현재 플레이헤드 스텝 위치에 원클릭으로 일괄 삽입해 주는 매크로 버튼을 추가했습니다.
- **Swing % Slider**:
  - 50%(Straight)부터 75%(Heavy Swing)까지의 그루브를 조정할 수 있는 슬라이더 UI를 추가하여 `swingAmount` 상태값을 연동했습니다.

### C. 신규 워크플로우 컴포넌트 추가
1. **`src/components/ScratchPad.tsx` (Studio One Scratch Pad)**:
   - 현재 메인 타임라인의 모든 트랙 데이터(시퀀스, 드럼 패치)를 임시 메모리 버퍼(`scratchData`)에 복사하여 안전하게 백업해 둡니다.
   - 사용자는 이 독립된 공간에서 대안 멜로디나 어레인지먼트를 비파괴적으로 실험해 본 후, 마음에 들면 "Apply to Main Timeline" 버튼을 통해 메인 시퀀스에 적용할 수 있습니다.
2. **`src/components/LiveLoops.tsx` (Logic Pro Live Loops)**:
   - 8x8 클립 그리드 매트릭스를 제공합니다. 각 트랙 라인별로 6개의 루프 슬롯이 제공되며, 독립적으로 클릭하여 오디션 재생 및 실시간 루핑 상태를 제어합니다.
   - 우상단 "Scene" 버튼을 클릭하면 세로 열의 모든 클립이 동시 트리거되는 실시간 세션 연주 환경을 제공합니다.
3. **`src/components/ActionManagerModal.tsx` (Reaper Action Shortcuts)**:
   - DAW 내부의 단축키(`Space` 재생/정지, `Esc` 되감기, `Ctrl+Z` 실행 취소 등)를 쉽게 검색하고 학습할 수 있도록 키보드 바인딩 가이드를 제공하는 모달입니다. 단축키 `?` 또는 상단 메뉴의 "Actions (?)" 버튼으로 토글됩니다.
4. **`src/components/RoutingMatrix.tsx` (Reaper Routing Matrix)**:
   - 각 트랙이 Master Out, Delay Bus, Reverb Bus, Submix Bus로 신호를 송출할지 여부를 토글할 수 있는 그리드 스위치 매트릭스 뷰입니다.

---

## 2. 해결된 빌드 에러 및 타입 정합성 복구 내역

Vite 빌드 환경(`tsconfig.json` 내 `noUnusedLocals: true` 엄격 모드 적용)에서 발생한 모든 에러를 해결했습니다:

1. **`TrackList.tsx` 임포트 누락**:
   - `Folder`, `FolderOpen` 등 쓰이지 않는 아이콘 임포트를 지우고, 유실되었던 `AudioEngine` 및 `Track` 타입을 복구하여 타입 오류를 제거했습니다.
2. **`App.tsx` 탭 렌더링 매핑 수정**:
   - **Mixer Props**: Mixer 컴포넌트가 받지 않는 `selectedTrackId`, `onSelectTrack`을 제거하고 필수 속성인 `isPlaying={isPlaying}`을 바인딩했습니다.
   - **DrumPad Props**: 플레이헤드가 움직일 때 드럼 패드의 재생 위치 표시등이 동기화될 수 있도록 필수 콜백인 `onPlayheadMove={handlePlayheadMove}`를 추가 전달했습니다.
   - **임포트 정상화**: `AutomationEditor`, `ArrangementEditor` 컴포넌트 임포트가 빠졌던 문제를 복구하고, 각 에디터가 요구하는 필수 데이터 및 핸들러(`tracks`, `bpm`, `onBpmChange`, `loopStart/End`, `onLoopChange`)를 누락 없이 주입했습니다.
3. **미사용 로컬 함수/상태 소멸**:
   - 컴포넌트 내부에서 사용되지 않던 `handleUpdateSteps` 함수와 `showShortcutsHelp` 상태를 제거하여 빌드 경고가 에러로 격상되는 현상을 완전히 차단했습니다.

---

## 3. Qwen을 위한 후속 소스코드 고도화 제안 (Next Steps)

현재 UI 바인딩 및 데이터 모델(JSON 백업, 트랙 상태 변경 콜백 등)은 완벽히 동작하는 뼈대로 구축되어 있습니다. Qwen은 이 기반 위에서 다음 핵심 알고리즘들의 **실제 오디오 처리 연결 및 세부 로직**을 고도화해 주세요:

1. **Live Loops 실제 오디오/MIDI 루프 재생 연결**:
   - 현재 `LiveLoops.tsx`는 UI 상에서 루핑 상태가 토글되고 단발성 테스트 음정이 트리거되는 단계입니다.
   - `AudioEngine.ts`와 연동하여, 사용자가 Live Loops의 특정 클립을 켜면 메인 타임라인 대신 해당 트랙에 할당된 루프 시퀀스(또는 AudioBuffer)가 지정된 Grid Quantize(예: 1 Bar) 주기에 맞춰 오프라인/실시간 루핑되도록 오디오 스케줄러를 고도화해 주세요.
2. **Routing Matrix의 Web Audio Graph 실제 연결**:
   - `RoutingMatrix.tsx`에서 토글한 체크박스 상태를 바탕으로 `AudioEngine.ts` 내부의 `trackNodes` 연결 그래프가 동적으로 변경되도록 연동해 주세요.
   - 예를 들어, Delay Send 체크박스가 꺼지면 `nodes.eqHigh.disconnect(nodes.delaySend)`를 실행하고, 켜지면 다시 연결을 수립하는 연결 제어 로직을 구현해 주시면 좋습니다.
3. **스윙(Swing %) 퀀타이즈 스케줄러 알고리즘**:
   - `PianoRoll.tsx`에서 설정한 `swingAmount` (50% ~ 75%) 값이 `AudioEngine.ts`에서 노트를 트리거하는 재생 시점 스케줄러(`playSynthNote` 등)에 영향을 주어, 홀수/짝수 스텝 간의 시간 간격(offset)이 물리적으로 지연 연주되도록 하는 그루브 퀀타이즈 수식을 적용해 주세요.
