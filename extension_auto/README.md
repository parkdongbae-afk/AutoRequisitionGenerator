# 확장 프로그램 개발자 모드 및 자동 설치 v18.1

Chrome, Microsoft Edge, NAVER Whale 프로필별로 다음 작업을 자동화합니다.

## v18.1 수정 사항

Edge 폴더 선택창의 `Edit automation_id=1152` (`폴더:`) 입력칸에
설치 대상 경로를 직접 기록하고, `Button automation_id=1` (`폴더 선택`)을
누르도록 수정했습니다. 따라서 Windows가 마지막으로 사용했던 기존 익스텐션
폴더에서 대화상자를 열더라도 실제 설치 대상은 프로그램에서 선택한 경로로
교체됩니다.


1. 브라우저를 종료하고 선택한 프로필로 다시 실행
2. 확장 프로그램 관리 페이지로 이동
3. 개발자 모드를 켜거나 끄기
4. 개발자 모드를 켠 뒤 **압축 해제된 익스텐션 폴더를 자동으로 로드**

## 빠른 테스트

1. `install_and_run.bat`을 실행합니다.
2. 설치할 브라우저 프로필을 선택합니다.
3. `테스트용` 버튼을 누릅니다.
   - 처음 실행할 때 기본값으로 이미 선택되어 있습니다.
   - 번들된 `test_extension`은 `%APPDATA%\ExtensionDeveloperModeManager\extensions\auto_install_test_extension`으로 복사됩니다.
4. `개발자 모드 켜기 + 익스텐션 설치`를 누릅니다.
5. 브라우저 종료 확인창에서 `종료 후 계속`을 누릅니다.
6. 관리 페이지에 **자동 설치 테스트 익스텐션** 카드가 표시되는지 확인합니다.

테스트 익스텐션은 권한을 요구하지 않으며, 툴바 아이콘에 초록색 `OK` 배지를 표시합니다.

## 직접 개발한 익스텐션 설치

- `폴더 선택`을 눌러 `manifest.json`이 들어 있는 최상위 폴더를 선택합니다.
- 프로필을 선택한 뒤 `개발자 모드 켜기 + 익스텐션 설치`를 누릅니다.
- 마지막으로 선택한 익스텐션 경로는 설정 파일에 저장됩니다.

설정 파일:

```text
%APPDATA%\ExtensionDeveloperModeManager\config.json
```

> 압축 해제 상태로 설치한 익스텐션은 원본 폴더를 계속 참조합니다. 폴더를 삭제하거나 이동하면 브라우저가 익스텐션을 로드할 수 없습니다.

## 자동 설치 방식

프로그램은 브라우저가 제공하는 개발자용 설치 흐름을 Windows UI Automation으로 수행합니다.

- 확장 프로그램 관리 페이지 열기
- 개발자 모드 활성화
- `압축해제된 확장 프로그램을 로드합니다` / `Load unpacked` 버튼 클릭
- Windows 폴더 선택창에 익스텐션 경로 입력
- 관리 페이지에서 익스텐션 이름 확인

브라우저 정책이 개발자 모드 또는 로컬 익스텐션 로드를 차단하는 환경에서는 설치할 수 없습니다.

## 실행

```text
install_and_run.bat
```

또는:

```text
run.bat
```

## EXE 빌드

```text
build_windows.bat
```

완성 파일:

```text
dist\ExtensionDeveloperModeManager.exe
```

`build_windows.bat`은 `test_extension` 폴더를 EXE에 포함합니다. onefile EXE의 임시 폴더는 프로그램 종료 후 제거되므로, 실행 시 테스트 익스텐션을 APPDATA의 영구 경로로 복사한 뒤 로드합니다.

## 제한 사항

- Windows 전용입니다.
- 브라우저 UI 언어는 한국어와 영어를 우선 지원합니다.
- 브라우저 또는 Windows의 UI가 크게 변경되면 UI Automation 탐색 규칙을 조정해야 할 수 있습니다.
- 회사/학교 관리 정책으로 개발자 모드가 비활성화된 경우 정책을 우회하지 않습니다.
