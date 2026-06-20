# Copilot Web App (scaffold)

이 리포지토리는 다음 조건으로 스캐폴딩되었습니다:
- 웹 앱 (Express backend + React frontend)
- GitHub Copilot SDK 통합 (서버에서 @github/copilot-sdk 사용)
- Azure Web App 배포용 GitHub Actions 워크플로

빠른 시작
1. 서버: `cd server && npm install`
2. 클라이언트: `cd client && npm install && npm run build`
3. 클라이언트 빌드가 `client/dist`에 생성되면 `server/public`로 복사하세요 (워크플로에서 자동화됨).
4. 서버 실행: `cd server && npm start`

Copilot SDK 참고
- 백엔드에서 `@github/copilot-sdk`를 사용합니다. 로컬/프로덕션에서 Copilot 인증이 필요합니다. 자세한 내용은 GitHub Copilot SDK 문서(https://docs.github.com/en/copilot/how-tos/copilot-sdk/getting-started)를 참고하세요.

Azure 배포
- 워크플로는 `AZURE_WEBAPP_NAME`과 `AZURE_WEBAPP_PUBLISH_PROFILE` 시크릿이 설정되어 있어야 합니다. 퍼블리시 프로필을 사용하거나 다른 Azure 인증 방법을 적용하세요.

보안 및 운영
- Copilot SDK 인증은 별도로 구성해야 하며 비밀(토큰, 프로필)을 코드에 포함하지 마세요.

---

(이 변경사항은 로컬 커밋으로 기록됩니다; 원격 푸시는 요청 시 진행합니다.)
